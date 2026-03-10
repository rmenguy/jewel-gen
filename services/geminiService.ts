import { ExtractionResult, MannequinCriteria, RefinementType, RefinementSelections, ExtractionLevel, JewelryBlueprint, ProductDimensions, PoseKey, SegmentationResult } from "../types";

const CATALOG_SYSTEM_INSTRUCTION = `
**ROLE**: Tu es CATALOG.ENGINE, un expert technique en scraping de données e-commerce.

**MISSION**: Analyser le code source et le contenu visuel pour extraire un catalogue produit PRÉCIS.

**PROTOCOLE DE RECHERCHE D'IMAGES (CRITIQUE)**:
Les images sont la priorité absolue. Pour chaque produit, tu dois trouver l'URL de l'image la plus grande possible.
1. **JSON-LD / Microdata** : Cherche dans les balises \`<script type="application/ld+json">\`. C'est souvent là que se trouve l'URL propre (\`image\`: "https://...").
2. **OpenGraph** : Regarde les balises \`<meta property="og:image">\`.
3. **Shopify** : Si l'URL contient \`_small\`, \`_thumb\`, \`_100x\`, REMPLACE par \`_master\` ou \`_1024x1024\` ou supprime le suffixe de taille pour obtenir la HD.
4. **Attributs HTML** : Cherche les attributs \`data-src\`, \`srcset\` ou \`data-high-res\` dans les balises \`<img>\`. Ne prends pas les thumbnails.

**STRATÉGIE D'EXTRACTION**:
1. Si l'URL est une collection (ex: /collections/all), identifie la grille de produits.
2. Si l'URL est une page produit unique, extrais ce seul produit.
3. **URLs ABSOLUES** : Assure-toi que toutes les \`image_url\` commencent par \`https://\`. Si l'image est \`//cdn.shopify...\`, ajoute \`https:\`.

**OUTPUT FORMAT (JSON)**:
{
  "store": "Nom de la boutique",
  "count": nombre_entier,
  "products": [
    {
      "sku": "Unique ID ou Hash du titre",
      "title": "Nom exact",
      "image_url": "URL_DIRECTE_IMAGE_HD",
      "price": "Prix avec devise",
      "type": "Catégorie"
    }
  ]
}

**RÈGLES STRICTES**:
- Ne jamais inventer une URL d'image. Si introuvable, laisse vide.
- Ignore les produits sans image.
- Si le site bloque l'accès direct, utilise Google Search pour trouver l'image correspondante via l'onglet Images.
`;

let API_KEY = '';
const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export function setApiKey(key: string) {
    API_KEY = key;
}

export function getApiKey(): string {
    return API_KEY;
}

/**
 * Call the Gemini API directly from the browser (CORS supported by Google).
 */
async function callGeminiAPI(model: string, requestBody: Record<string, unknown>): Promise<any> {
    const url = `${GEMINI_BASE}/models/${model}:generateContent?key=${API_KEY}`;
    const body = JSON.stringify(requestBody);
    console.log(`[GEMINI] Calling ${model}, body size: ${body.length}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Call Imagen 4 via :predict endpoint directly from the browser.
 */
async function callImagenAPI(model: string, requestBody: Record<string, unknown>): Promise<any> {
    const url = `${GEMINI_BASE}/models/${model}:predict?key=${API_KEY}`;
    const body = JSON.stringify(requestBody);
    console.log(`[IMAGEN] Calling ${model}, body size: ${body.length}`);

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API error ${response.status}: ${errorText}`);
    }

    return response.json();
}

/**
 * Enhanced retry logic with exponential backoff and jitter.
 */
async function withRetry<T>(fn: () => Promise<T>, maxRetries = 5): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = (error?.message || String(error) || "").toLowerCase();
      const isRetryable =
        errorMessage.includes("429") ||
        errorMessage.includes("too many requests") ||
        errorMessage.includes("500") ||
        errorMessage.includes("internal") ||
        errorMessage.includes("503") ||
        errorMessage.includes("overloaded") ||
        errorMessage.includes("deadline exceeded");

      if (isRetryable && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 3000 + Math.random() * 2000;
        console.warn(`[CATALOG.ENGINE] Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const extractShopifyCatalog = async (storeUrl: string): Promise<ExtractionResult> => {
  return withRetry(async () => {
    const response = await callGeminiAPI('gemini-3-flash-preview', {
      contents: [{
        parts: [{
          text: `${CATALOG_SYSTEM_INSTRUCTION}

URL CIBLE: ${storeUrl}.

TÂCHE: Extrais le catalogue produits en JSON.
Priorité absolue : Trouver les URLs des images principales en haute résolution.
Si c'est du Shopify, essaie d'accéder virtuellement au JSON ou de parser le HTML pour trouver "products".`
        }]
      }],
      generationConfig: {
        responseMimeType: "application/json"
      },
      tools: [{ googleSearch: {} }]
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "";
    try {
      const parsed = JSON.parse(text) as ExtractionResult;
      if (parsed.error) {
         throw new Error(parsed.solution ? `${parsed.error}. ${parsed.solution}` : parsed.error);
      }
      if (parsed.products) {
        parsed.products = parsed.products.map((p: any) => ({
            ...p,
            image_url: p.image_url.startsWith('//') ? `https:${p.image_url}` : p.image_url
        }));
      }
      return parsed;
    } catch (e: any) {
      throw new Error(e.message || "Erreur de structuration des données.");
    }
  });
};

export const generateMannequin = async (criteria: MannequinCriteria, overrideParams?: string[]): Promise<string> => {
  return withRetry(async () => {
    const vibeMap: Record<string, string> = {
        'Minimalist': 'natural soft window light, cream seamless background, composed serene pose, Cos/Arket aesthetic, quiet luxury',
        'Luxury': 'warm sophisticated lighting, elegant refined pose, Ralph Lauren/Hermès aesthetic, rich and understated atmosphere',
        'Ethereal': 'dreamy diffuse backlight, delicate open pose, poetic soft atmosphere, romantic and airy mood',
        'Street/Urban': 'high contrast directional light, confident edgy attitude, dynamic pose, Balenciaga/Off-White urban aesthetic',
        'Classic': 'timeless even studio lighting, upright elegant posture, CHANEL/Saint Laurent refined aesthetic, poised and sophisticated',
        'Sunkissed': 'warm golden hour outdoor light, relaxed candid lifestyle pose, sun-drenched natural setting, fresh and luminous',
        'Bohème Chic': 'warm natural backlight, free-spirited effortless pose, artisan/bohemian atmosphere, Isabel Marant/Free People aesthetic, layered textures and natural fabrics, romantic outdoor or rustic interior setting',
    };

    const skinMap: Record<string, string> = {
        'Clean': 'clear healthy skin, natural pores subtly visible, perfectly even complexion, fresh radiant and blemish-free, healthy glow',
        'Natural': 'natural skin with visible pores and subtle skin grain, healthy even complexion with slight natural variation, clear and blemish-free',
        'Freckled': 'natural freckles across nose bridge and cheeks, healthy skin tone, sun-kissed and natural, clear complexion',
        'Glass Skin': 'dewy luminous skin, subtle healthy glow on cheekbones, visible pores underneath, lit-from-within radiance',
        'Matte': 'matte balanced skin, pores faintly visible, smooth even finish, healthy clear complexion',
    };

    const makeupMap: Record<string, string> = {
        'No Makeup': 'completely bare face, zero cosmetics, natural brows, bare lip, fresh clean healthy skin',
        'Barely There': 'barely-there makeup, light tinted moisturizer effect, groomed brows, tinted balm on lips, skin texture fully visible',
        'Natural': 'light natural makeup, subtle coverage, defined brows, mascara, nude lip, fresh and polished',
        'Soft Glam': 'soft glam makeup, light contour, subtle highlight, soft earth-tone eye shadow, rose-nude lip, polished and flattering',
        'Editorial': 'artistic fashion makeup, graphic liner or bold creative eye, strong editorial expression, avant-garde',
        'Bold Night': 'full evening glamour, smoky eye or deep matte lip, defined contour, luminous highlight, luxurious finish',
    };

    // Map new UI fields to prompt values
    const poseMap: Record<string, string> = {
        'standing': 'POSE: Standing straight facing camera, feet shoulder-width apart, arms naturally at sides, weight evenly distributed, relaxed shoulders. Full body visible from head to feet.',
        'walking': 'POSE: Mid-stride walking towards camera, left foot forward right foot behind, natural arm swing, dynamic movement captured. Full body visible from head to feet.',
        'arms_up': 'POSE: Standing with left hand on hip, right arm relaxed, slight lean to one side, confident editorial model stance, weight on one leg. Full body visible from head to feet.',
        'sitting': 'POSE: Seated on a simple stool, legs crossed at ankles, hands resting on thighs, upright posture, relaxed shoulders. Full body visible from head to feet.',
    };

    const lightingMap: Record<string, string> = {
        'soft': 'soft diffused natural window light, minimal shadows, gentle and flattering',
        'studio': 'professional studio lighting with key light and fill, controlled and even',
        'dramatic': 'dramatic chiaroscuro lighting, deep shadows on one side, cinematic and moody',
    };

    const hairCutMap: Record<string, string> = {
        'laches': 'Hair worn loose and natural, flowing freely',
        'ondule': 'Natural undone waves with movement and texture',
        'lisse': 'Sleek straight hair, smooth and polished',
        'boucle': 'Defined curls with natural bounce and volume',
        'afro': 'Natural afro-textured hair with full volume',
        'chignon': 'Hair pulled back into an elegant chignon bun',
        'queue': 'Hair tied in a sleek ponytail',
        'tresse': 'Hair styled in braids',
        'pixie': 'Short pixie cut, cropped close to the head',
        'wavy-bob': 'Wavy textured bob, effortless undone waves with natural movement',
    };

    const hairLengthMap: Record<string, string> = {
        'tres-court': 'very short, pixie-length',
        'court': 'short, chin-length',
        'mi-long': 'medium, shoulder-length',
        'long': 'long, chest-length',
        'tres-long': 'very long, waist-length',
    };

    // Map ethnicity codes to descriptive text
    const ethnicityMap: Record<string, string> = {
        'european': 'European/Caucasian',
        'east_asian': 'East Asian (Japanese, Korean, Chinese)',
        'african': 'African/Black',
        'south_asian': 'South Asian/Indian',
        'latin': 'Latin American/Hispanic',
        'middle_eastern': 'Middle Eastern/North African',
    };

    // Map body composition slider to morphology text
    const bodyFromSlider = (value: number | undefined): string => {
        if (value === undefined) return criteria.morphology || 'Standard';
        if (value < 20) return 'slim petite frame, lean and delicate proportions';
        if (value < 40) return 'slender athletic build, toned and lean';
        if (value < 60) return 'standard fashion model proportions, balanced and toned';
        if (value < 80) return 'curvy feminine figure, defined waist with fuller hips and bust';
        return 'plus-size full figure, confident and voluptuous';
    };

    const vibePrompt = vibeMap[criteria.vibe] || vibeMap['Minimalist'];
    const skinPrompt = skinMap[criteria.skinTexture] || skinMap['Natural'];
    const makeupPrompt = makeupMap[criteria.makeup] || makeupMap['Natural'];
    const posePrompt = poseMap[criteria.pose || ''] || 'standing straight, relaxed editorial pose';
    const lightingPrompt = lightingMap[criteria.lighting || ''] || '';
    const ethnicityPrompt = ethnicityMap[criteria.ethnicity] || criteria.ethnicity;
    const morphologyPrompt = bodyFromSlider(criteria.bodyComposition);

    // Mode libre detection: overrideParams being defined (even empty) means mode libre is active
    const isModeLivre = overrideParams !== undefined;
    const shouldInclude = (param: string): boolean => {
      if (!isModeLivre) return true;
      return overrideParams!.includes(param);
    };

    let prompt: string;

    if (!isModeLivre) {
      // ── NORMAL MODE: existing basePrompt, completely unchanged ──
      const basePrompt = `EDITORIAL FASHION PORTRAIT shot on medium format film camera. RAW UNPROCESSED LOOK.
SUBJECT: ${criteria.gender}, ${criteria.age} years old, ${ethnicityPrompt} ethnicity.
HAIR: ${criteria.hairColor}, ${hairCutMap[criteria.hairCut] || 'Hair worn loose and natural'}, ${hairLengthMap[criteria.hairLength] || 'medium, shoulder-length'}.
${posePrompt} Direct eye contact with camera.
MOOD: ${vibePrompt}.${lightingPrompt ? `\nLIGHTING: ${lightingPrompt}.` : ''}
SKIN (CRITICAL): ${skinPrompt}. Photorealistic skin with natural texture — visible pores and subtle skin grain, healthy even complexion. NO blemishes, NO red patches, NO skin conditions. The skin must look like a real healthy person in a professional fashion editorial: real texture but clear, healthy and flattering. Think Vogue/Elle editorial photography standards.
MAKEUP: ${makeupPrompt}.
CLOTHING: Simple dark or neutral top.
TECHNICAL: Shot on Hasselblad H6D loaded with Kodak Portra 400 film. Lens 80mm f/2.8, ${lightingPrompt || 'natural window light with soft fill'}. CRITICAL TEXTURE: Film grain CLEARLY visible on skin and across the image. Skin pores, peach fuzz, and natural micro-texture must be photographic and tactile — NOT smooth, NOT digitally retouched, NOT AI-generated. The image must look like a scanned medium format negative: organic, grainy, human. Color grading: muted, slightly desaturated, warm analog tones.`;

      prompt = criteria.customPrompt?.trim()
        ? `${basePrompt}\nADDITIONAL INSTRUCTIONS: ${criteria.customPrompt.trim()}`
        : basePrompt;

    } else if (overrideParams!.length === 0) {
      // ── MODE LIBRE: custom prompt only, no params appended ──
      prompt = criteria.customPrompt?.trim() || 'Fashion portrait photo';

    } else {
      // ── MODE LIBRE with overrides: custom prompt + only forced params ──
      const parts: string[] = [criteria.customPrompt?.trim() || 'Fashion portrait photo'];

      if (shouldInclude('gender') || shouldInclude('age') || shouldInclude('ethnicity')) {
        const subjectParts: string[] = [];
        if (shouldInclude('gender')) subjectParts.push(criteria.gender);
        if (shouldInclude('age')) subjectParts.push(`${criteria.age} years old`);
        if (shouldInclude('ethnicity')) subjectParts.push(`${ethnicityPrompt} ethnicity`);
        parts.push(`SUBJECT: ${subjectParts.join(', ')}.`);
      }

      if (shouldInclude('hair')) {
        parts.push(`HAIR: ${criteria.hairColor}, ${hairCutMap[criteria.hairCut] || 'Hair worn loose and natural'}, ${hairLengthMap[criteria.hairLength] || 'medium, shoulder-length'}.`);
      }

      if (shouldInclude('body')) {
        parts.push(`BODY: ${morphologyPrompt}.`);
      }

      if (shouldInclude('pose')) {
        parts.push(`${posePrompt} Direct eye contact with camera.`);
      }

      if (shouldInclude('vibe')) {
        parts.push(`MOOD: ${vibePrompt}.`);
      }

      if (shouldInclude('lighting') && lightingPrompt) {
        parts.push(`LIGHTING: ${lightingPrompt}.`);
      }

      if (shouldInclude('skin')) {
        parts.push(`SKIN: ${skinPrompt}. Photorealistic skin with natural texture.`);
      }

      if (shouldInclude('makeup')) {
        parts.push(`MAKEUP: ${makeupPrompt}.`);
      }

      prompt = parts.join('\n');
    }

    const response = await callImagenAPI('imagen-4.0-ultra-generate-001', {
      instances: [{ prompt }],
      parameters: {
        sampleCount: 1,
        aspectRatio: "3:4",
        personGeneration: "allow_adult"
      }
    });

    const prediction = response.predictions?.[0];
    if (prediction?.bytesBase64Encoded) {
      return `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`;
    }
    throw new Error("L'IA n'a pas retourné d'image.");
  });
};

/**
 * Generate a new mannequin inspired by a reference photo.
 *
 * TWO-STEP approach to prevent lazy copy and no-output failures:
 * 1. Gemini analyzes the reference photo → returns style notes as TEXT only
 * 2. Those style notes are fed to Imagen (text-to-image) → fresh generation,
 *    physically incapable of reproducing the reference person.
 *
 * Fallback chain:
 * - Step 1 tries multiple models; if all fail → falls back to standard generateMannequin()
 * - Step 2 makes "no predictions" retryable → exhausted retries → falls back to standard generateMannequin()
 */
export const generateMannequinFromReference = async (
    referenceImageBase64: string,
    criteria: MannequinCriteria,
    overrideParams?: string[]
): Promise<string> => {
    const ethnicityMap: Record<string, string> = {
        'european': 'European/Caucasian',
        'east_asian': 'East Asian (Japanese, Korean, Chinese)',
        'african': 'African/Black',
        'south_asian': 'South Asian/Indian',
        'latin': 'Latin American/Hispanic',
        'middle_eastern': 'Middle Eastern/North African',
    };
    const ethnicityPrompt = ethnicityMap[criteria.ethnicity] || criteria.ethnicity;

    const mimeType = referenceImageBase64.startsWith('data:image/jpeg') ? 'image/jpeg'
        : referenceImageBase64.startsWith('data:image/webp') ? 'image/webp'
        : 'image/png';
    const imageData = referenceImageBase64.includes('base64,')
        ? referenceImageBase64.split(',')[1]
        : referenceImageBase64;

    const analyzePromptText = `Analyze this fashion portrait photo and describe its visual style as a concise technical list. Be specific and photographic. 2 sentences per item max.

1. LIGHTING: Direction, quality (hard/soft), color temperature, shadow style
2. BACKGROUND: Setting, colors, depth, texture
3. FRAMING: Crop type (full body / half body / portrait), camera angle, composition
4. MOOD: Overall atmosphere, color palette, emotional tone
5. CLOTHING AESTHETIC: Style category (minimal, editorial, street, luxury, bohemian, etc.)
6. PHOTOGRAPHY STYLE: Genre (editorial, lifestyle, commercial lookbook, etc.)`;

    // ── STEP 1: Extract style from reference photo (TEXT only, no image output) ──
    // Try multiple models — preview models can be unstable or renamed by Google.
    let styleNotes = '';
    const analysisModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-pro-image-preview'];
    for (const model of analysisModels) {
        try {
            const analyzeResponse = await callGeminiAPI(model, {
                contents: [{
                    parts: [
                        { text: analyzePromptText },
                        { inlineData: { mimeType, data: imageData } },
                    ],
                }],
                generationConfig: { responseModalities: ['TEXT'] },
            });
            const extracted = analyzeResponse.candidates?.[0]?.content?.parts
                ?.filter((p: any) => p.text)
                ?.map((p: any) => p.text)
                ?.join('') || '';
            if (extracted.length > 30) {
                styleNotes = extracted;
                console.log(`[REF-GEN] Style extracted via ${model}:`, styleNotes.substring(0, 200));
                break;
            }
        } catch (err: any) {
            console.warn(`[REF-GEN] Analysis failed with ${model}:`, err?.message || err);
        }
    }

    // If analysis completely failed → fall back to standard generation
    if (!styleNotes) {
        console.warn('[REF-GEN] Could not extract style notes from reference. Falling back to standard generation.');
        return generateMannequin(criteria, overrideParams);
    }

    // ── STEP 2: Generate via Imagen using style notes ──
    // Imagen is text-to-image only — physically incapable of copying the reference person.
    const isModeLivre = overrideParams !== undefined;
    const shouldInclude = (param: string): boolean => {
        if (!isModeLivre) return true;
        return overrideParams!.includes(param);
    };

    const bodyPrompt =
        (criteria.bodyComposition ?? 50) < 20 ? 'slim petite frame' :
        (criteria.bodyComposition ?? 50) < 40 ? 'slender athletic build' :
        (criteria.bodyComposition ?? 50) < 60 ? 'standard fashion model proportions' :
        (criteria.bodyComposition ?? 50) < 80 ? 'curvy feminine figure' : 'plus-size full figure';

    let generationPrompt: string;

    if (!isModeLivre) {
        // ── NORMAL MODE: existing prompt, completely unchanged ──
        generationPrompt = `EDITORIAL FASHION PORTRAIT shot on medium format analog film.
SUBJECT: ${criteria.gender}, ${criteria.age} years old, ${ethnicityPrompt} ethnicity. Unique individual, original face, original identity.
STYLE DIRECTION (reproduce this aesthetic precisely, NOT the person):
${styleNotes}
SKIN (CRITICAL): Photographic organic skin — visible pores, natural Kodak Portra 400 film grain on skin, peach fuzz, natural micro-texture. Absolutely NO digital smoothing or AI-skin appearance. Looks like a scanned medium format negative.
BODY: ${bodyPrompt}.${criteria.customPrompt?.trim() ? `\nADDITIONAL: ${criteria.customPrompt.trim()}` : ''}`;
    } else {
        // ── MODE LIBRE: build prompt conditionally ──
        const parts: string[] = [];

        // Custom prompt is the base in mode libre
        if (criteria.customPrompt?.trim()) {
            parts.push(criteria.customPrompt.trim());
        } else {
            parts.push('EDITORIAL FASHION PORTRAIT shot on medium format analog film.');
        }

        // Subject line — only include specified params
        if (shouldInclude('gender') || shouldInclude('age') || shouldInclude('ethnicity')) {
            const subjectParts: string[] = [];
            if (shouldInclude('gender')) subjectParts.push(criteria.gender);
            if (shouldInclude('age')) subjectParts.push(`${criteria.age} years old`);
            if (shouldInclude('ethnicity')) subjectParts.push(`${ethnicityPrompt} ethnicity`);
            parts.push(`SUBJECT: ${subjectParts.join(', ')}. Unique individual, original face, original identity.`);
        }

        // Style notes from Step 1 are ALWAYS included
        parts.push(`STYLE DIRECTION (reproduce this aesthetic precisely, NOT the person):\n${styleNotes}`);

        if (shouldInclude('body')) {
            parts.push(`BODY: ${bodyPrompt}.`);
        }

        if (shouldInclude('pose')) {
            parts.push('Full body visible, editorial pose.');
        }

        if (shouldInclude('lighting')) {
            parts.push('Professional studio lighting.');
        }

        generationPrompt = parts.join('\n');
    }

    try {
        return await withRetry(async () => {
            const imagenResponse = await callImagenAPI('imagen-4.0-ultra-generate-001', {
                instances: [{ prompt: generationPrompt }],
                parameters: { sampleCount: 1, aspectRatio: '3:4', personGeneration: 'allow_adult' },
            });
            const prediction = imagenResponse.predictions?.[0];
            if (prediction?.bytesBase64Encoded) {
                return `data:${prediction.mimeType || 'image/png'};base64,${prediction.bytesBase64Encoded}`;
            }
            // Treat empty predictions as a 500 so withRetry will retry it
            throw new Error('500: Imagen returned no predictions — retrying');
        });
    } catch (err) {
        // Final safety net: if Imagen repeatedly returns nothing, use standard generation
        console.warn('[REF-GEN] Imagen failed after retries. Falling back to standard generation.', err);
        return generateMannequin(criteria, overrideParams);
    }
};

/**
 * Photo Book: 4 studio angles for identity-consistent multi-angle shoots.
 */
export const BOOK_ANGLES = [
    {
        key: 'front',
        label: 'Face / Front',
        prompt: 'ANGLE: Front-facing portrait. Direct eye contact with camera. Head-and-shoulders to waist framing. Straight-on camera angle, no tilt.',
    },
    {
        key: 'left_profile',
        label: 'Profil Gauche (3/4)',
        prompt: 'ANGLE: Left three-quarter view. The model is turned approximately 30-40 degrees to their right, showing the left side of their face prominently. Slight upward chin angle. Same head-and-shoulders framing.',
    },
    {
        key: 'right_profile',
        label: 'Profil Droit (3/4)',
        prompt: 'ANGLE: Right three-quarter view. The model is turned approximately 30-40 degrees to their left, showing the right side of their face prominently. Slight upward chin angle. Same head-and-shoulders framing.',
    },
    {
        key: 'full_body',
        label: 'Plan Large (Full Body)',
        prompt: 'ANGLE: Full-body wide shot. The model is visible from head to toe. Standing pose, arms naturally at sides. Camera at chest height. Full body with some space around.',
    },
];

/**
 * Generate a single book shot from a reference mannequin image.
 * Uses Gemini image-to-image to maintain identity across angles.
 */
export const generateBookShot = async (
    referenceImageBase64: string,
    anglePrompt: string
): Promise<string> => {
    return withRetry(async () => {
        const imageData = referenceImageBase64.includes('base64,')
            ? referenceImageBase64.split(',')[1]
            : referenceImageBase64;

        const prompt = `You are generating a professional fashion model photo book. The reference image shows the model. Generate a NEW photo of THIS EXACT SAME person (identical face, identical hair color and style, identical skin tone, identical clothing) but from a different angle and framing.

CRITICAL IDENTITY PRESERVATION: The person in the output must be RECOGNIZABLY the same individual as in the reference. Same facial features, same hair, same outfit, same body type. Do NOT change anything about the person.

${anglePrompt}

TECHNICAL: Professional studio photography, Hasselblad quality, soft natural lighting, clean neutral background. Kodak Portra 400 film grain, photorealistic. Output the new image.`;

        const parts = [
            { text: prompt },
            { inlineData: { mimeType: 'image/png', data: imageData } },
        ];

        const response = await callGeminiAPI('gemini-3-pro-image-preview', {
            contents: [{ parts }],
            generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error('No book shot image returned by the API.');
    });
};

/**
 * Fetch an external image as base64.
 * Works directly from the browser for most CDNs.
 * Falls back to corsproxy.io for CORS-blocked URLs.
 */
export const fetchImageAsBase64 = async (url: string): Promise<string> => {
    if (url.startsWith('data:')) {
        return url.split(',')[1];
    }

    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    } catch {
        // Fallback: CORS proxy
        console.warn(`[FETCH] Direct fetch failed for ${url}, trying CORS proxy...`);
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const response = await fetch(proxyUrl);
        if (!response.ok) throw new Error(`CORS proxy fetch failed: ${response.status}`);
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onloadend = () => {
                const result = reader.result as string;
                resolve(result.split(',')[1]);
            };
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }
};

const getPoseKeyForCategory = (category: string): PoseKey => {
    const cat = category.toLowerCase();
    if (cat.includes('sautoir') || cat.includes('collier') || cat.includes('necklace')) return 'neck';
    if (cat.includes('boucles') || cat.includes('earring')) return 'ear';
    if (cat.includes('bracelet')) return 'wrist';
    if (cat.includes('bague') || cat.includes('ring')) return 'hand';
    return 'neck';
};

export const generateProductionPhoto = async (
    mannequinBase64: string | null,
    productUrl: string,
    artisticDirection: string,
    category: string = '',
    blueprint?: JewelryBlueprint,
    dimensions?: ProductDimensions,
    bareCache?: { get: (key: string) => string | undefined; set: (key: string, img: string) => void }
): Promise<string> => {
    console.log('[PRODUCTION] Starting generation (bare+dress+pixel pipeline)');
    return withRetry(async () => {
        // --- Step A: Fetch product image ---
        const productBase64 = await fetchImageAsBase64(productUrl);
        const productBase64DataUri = `data:image/jpeg;base64,${productBase64}`;
        console.log('[PRODUCTION] Product image loaded');

        // --- Step B: Bare generation with cache ---
        let bareImage: string | null = null;
        if (mannequinBase64) {
            const poseKey = getPoseKeyForCategory(category);
            const cacheKey = `${poseKey}-${artisticDirection.substring(0, 20)}`;
            const cached = bareCache?.get(cacheKey);
            if (cached) {
                bareImage = cached;
                console.log(`[PRODUCTION] Bare mannequin from cache — key: ${cacheKey}`);
            } else {
                console.log(`[PRODUCTION] Generating bare mannequin — pose: ${poseKey}`);
                bareImage = await generateBareMannequin(mannequinBase64, artisticDirection, poseKey, category);
                bareCache?.set(cacheKey, bareImage);
                console.log(`[PRODUCTION] Bare mannequin generated and cached — key: ${cacheKey}`);
            }
        }

        // --- Step C: Dress pass ---
        let dressedImage: string;
        if (bareImage) {
            console.log('[PRODUCTION] Dressing bare mannequin with jewelry');
            dressedImage = await dressWithJewelry(bareImage, productBase64DataUri, blueprint || null, dimensions || null, category);
            console.log('[PRODUCTION] Dress pass complete');
        } else {
            // Fallback: single-pass generation (no mannequin provided)
            console.log('[PRODUCTION] No mannequin — using single-pass fallback');
            let prompt = `Luxury commercial photography. 4K RESOLUTION. The product ${category ? `(${category})` : ''} is the centerpiece. `;
            prompt += `MANNEQUIN: Worn by a realistic model. `;

            const categoryLower = category.toLowerCase();
            if (categoryLower.includes('sautoir-long')) {
                prompt += `PLACEMENT: Very long sautoir necklace hanging freely from the neck, falling to navel/belly level. The chain/pendant drapes well below the chest with maximum visible length. NOT a short necklace — this is an extra-long sautoir reaching the navel. `;
            } else if (categoryLower.includes('sautoir')) {
                prompt += `PLACEMENT: Long necklace (sautoir) hanging from the neck, falling to mid-chest/sternum level. The chain drapes to the middle of the chest — NOT to the waist, NOT to the collarbone. Medium-long sautoir proportions, sternum-level. `;
            } else if (categoryLower.includes('collier') || categoryLower.includes('necklace')) {
                prompt += `PLACEMENT: Necklace worn close to the neck, sitting on or just below the collarbone area. Short to medium length, hugging the neckline. `;
            } else if (categoryLower.includes('bague') || categoryLower.includes('ring')) {
                prompt += `PLACEMENT: Ring worn on the finger, naturally positioned on the hand. Fingers relaxed and visible. `;
            } else if (categoryLower.includes('boucles') || categoryLower.includes('earring')) {
                prompt += `PLACEMENT: Earrings attached to earlobes, clearly visible. Head angled slightly to showcase the jewelry. Hair pulled back or tucked behind the ear if needed. `;
            } else if (categoryLower.includes('bracelet')) {
                prompt += `PLACEMENT: Bracelet worn on the wrist, naturally positioned. Wrist and forearm visible, relaxed hand pose. `;
            }

            if (blueprint) {
                prompt += `\nPRODUCT BLUEPRINT (REPRODUCE THIS EXACTLY):\n`;
                prompt += `Material: ${blueprint.material}. `;
                prompt += `Chain: ${blueprint.chainType}. `;
                if (blueprint.stoneShape !== 'none') prompt += `Stones: ${blueprint.stoneShape}, set in ${blueprint.stoneSetting}. `;
                if (blueprint.pendantShape !== 'none') prompt += `Pendant: ${blueprint.pendantShape}. `;
                prompt += `Finish: ${blueprint.finish}. `;
                prompt += `\nCRITICAL FIDELITY: ${blueprint.rawDescription} `;
                prompt += `The jewelry in the output MUST match the product reference image EXACTLY — same chain type, same stone shapes, same proportions. Do NOT approximate or substitute any element. `;
            }

            if (dimensions) {
                const anchors = buildDimensionAnchors(dimensions, category);
                if (anchors) prompt += `\n${anchors} `;
            }

            prompt += `SCENE: ${artisticDirection}. QUALITY: 8K hyper-realistic rendering, ultra-detailed.`;

            const parts: any[] = [{ text: prompt }];
            parts.push({
                inlineData: {
                    mimeType: "image/jpeg",
                    data: productBase64
                }
            });

            const response = await callGeminiAPI('gemini-3-pro-image-preview', {
                contents: [{ parts }],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                    imageConfig: { imageSize: '4K' },
                    temperature: 0.2,
                }
            });

            const extractImage = (resp: any): string | null => {
                for (const part of resp.candidates?.[0]?.content?.parts || []) {
                    if (part.inlineData) {
                        return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                    }
                }
                return null;
            };

            const fallbackImage = extractImage(response);
            if (!fallbackImage) throw new Error("Aucune image générée.");
            dressedImage = fallbackImage;
        }

        // --- Step D: Single refinement pass (AI compare with Pro → 1 correction) ---
        console.log('[PRODUCTION] Starting AI comparison (gemini-2.5-pro)');

        const aiValidation = await validateJewelryFidelityAI(dressedImage, productBase64DataUri, blueprint);
        console.log(`[AI-VALID] Score: ${aiValidation.score}/10, issues: ${aiValidation.issues.join('; ') || 'none'}`);

        // If score is good enough, return immediately
        if (aiValidation.passed) {
            console.log('[PRODUCTION] AI validation passed — no refinement needed');
            return dressedImage;
        }

        // Single correction pass using the specific issues identified by Pro
        const issueList = aiValidation.issues.join('. ');
        console.log(`[PRODUCTION] Refining — fixing: ${issueList}`);

        const dressedData = dressedImage.includes('base64,') ? dressedImage.split(',')[1] : dressedImage;
        const correctionParts: any[] = [
            { text: `Image 1 is the JEWELRY REFERENCE (packshot). Image 2 is a photo where the jewelry was placed on a model but has these problems: ${issueList}. Regenerate image 2 with the jewelry EXACTLY matching image 1. Fix the listed problems. Keep the model identical.` },
            { inlineData: { mimeType: 'image/jpeg', data: productBase64 } },
            { inlineData: { mimeType: 'image/png', data: dressedData } },
        ];

        const correctionResponse = await callGeminiAPI('gemini-3-pro-image-preview', {
            contents: [{ parts: correctionParts }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: { imageSize: '4K' },
                temperature: 0.2,
            }
        });

        for (const part of correctionResponse.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                console.log('[PRODUCTION] Refinement pass complete');
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        // Correction failed to produce image — return original dressed image
        console.log('[PRODUCTION] Refinement produced no image — returning dressed image');
        return dressedImage;
    });
};

/**
 * Generate a production photo with multiple jewelry pieces stacked on the same mannequin.
 */
export const generateStackedProductionPhoto = async (
    mannequinBase64: string | null,
    products: Array<{ imageUrl: string; category: string; name: string; blueprint?: JewelryBlueprint; dimensions?: ProductDimensions }>,
    artisticDirection: string,
    bareCache?: { get: (key: string) => string | undefined; set: (key: string, img: string) => void }
): Promise<string> => {
    console.log(`[STACK] Starting stacked production — ${products.length} products`);
    return withRetry(async () => {
        // --- Bare generation with cache ---
        let bareImage: string | null = null;
        if (mannequinBase64) {
            const poseKey = getPoseKeyForCategory(products[0]?.category || '');
            const cacheKey = `${poseKey}-${artisticDirection.substring(0, 20)}`;
            const cached = bareCache?.get(cacheKey);
            if (cached) {
                bareImage = cached;
                console.log(`[STACK] Bare mannequin from cache — key: ${cacheKey}`);
            } else {
                console.log(`[STACK] Generating bare mannequin — pose: ${poseKey}`);
                bareImage = await generateBareMannequin(mannequinBase64, artisticDirection, poseKey, products[0]?.category || '');
                bareCache?.set(cacheKey, bareImage);
                console.log(`[STACK] Bare mannequin generated and cached — key: ${cacheKey}`);
            }
        }

        const placementMap: Record<string, string> = {
            'sautoir-long': 'very long sautoir necklace hanging to navel/belly level, maximum drape length',
            'sautoir-court': 'sautoir necklace hanging to mid-chest/sternum level, medium-long drape',
            'sautoir': 'sautoir necklace hanging to mid-chest/sternum level',
            'necklace': 'necklace worn close to the neck on the collarbone',
            'collier': 'necklace worn close to the neck on the collarbone',
            'ring': 'ring worn on the finger',
            'bague': 'ring worn on the finger',
            'earrings': 'earring worn on the ear — if multiple earrings are stacked, place each at a DIFFERENT position on the SAME ear: first on the lobe, second on the upper lobe/helix, third on the tragus or conch. Each earring must be clearly distinct and separately visible',
            'boucles': 'earring worn on the ear — if multiple earrings are stacked, place each at a DIFFERENT position on the SAME ear: first on the lobe, second on the upper lobe/helix, third on the tragus or conch. Each earring must be clearly distinct and separately visible',
            'bracelet': 'bracelet worn on the wrist',
        };

        // Use bare image index offset: bare is image 1 if present
        const imageBase = bareImage ? 2 : 1;
        const productDescriptions = products.map((p, i) => {
            const catLower = (p.category || p.name || '').toLowerCase();
            const placement = Object.entries(placementMap).find(([key]) => catLower.includes(key));
            return `Product ${i + 1} (image ${imageBase + i}): ${p.category || p.name || 'jewelry'} — ${placement?.[1] || 'worn naturally on the model'}`;
        }).join('\n');

        let prompt = `Luxury commercial photography. 4K RESOLUTION. MULTIPLE JEWELRY STACKING — place ALL the following products on the SAME model simultaneously:\n${productDescriptions}\n\n`;

        if (bareImage) {
            prompt += `Image 1 is the bare model (no jewelry). Reconstruct this EXACT person — same face, same identity, same lighting. Add ONLY the jewelry products listed above. Do NOT alter the model's appearance in any way. `;
        } else if (mannequinBase64) {
            prompt += `TECHNICAL MANDATE — BIOMETRIC RECONSTRUCTION: You are a high-end Digital Double specialist. Reconstruct the EXACT physical identity of the subject in the reference (image 1). BIOMETRIC CONSTRAINTS: (1) Bone Structure — match the precise jawline, cheekbone height, and brow ridge geometry. (2) Ocular Detail — replicate eye shape, iris color intensity, and the specific fold of the eyelids. (3) Identity Marks — retain all defining characteristics: specific wrinkles, skin pores, moles, and authentic hairline. (4) The subject must be 100% recognizable as the INDIVIDUAL in the reference photo. Same individual, different jewelry. `;
        } else {
            prompt += `MANNEQUIN: Professional fashion model. `;
        }
        prompt += `Each piece of jewelry must be clearly visible and worn in its proper position. No overlap or obstruction between pieces. `;

        const earringCount = products.filter(p => {
            const cat = (p.category || p.name || '').toLowerCase();
            return cat.includes('boucle') || cat.includes('earring');
        }).length;
        if (earringCount >= 2) {
            prompt += `EARRING STACKING: ${earringCount} earrings must be placed on the SAME ear at DIFFERENT piercing positions (lobe, upper lobe, helix, tragus). Each earring is a separate piece — do NOT merge them. Show them stacked vertically along the ear. `;
        }

        // Inject per-product blueprints if available
        const blueprintDescriptions = products
            .filter(p => p.blueprint)
            .map((p, i) => `Product ${i + 1} BLUEPRINT: ${p.blueprint!.rawDescription}`)
            .join('\n');
        if (blueprintDescriptions) {
            prompt += `\nPRODUCT BLUEPRINTS (REPRODUCE EACH PIECE EXACTLY):\n${blueprintDescriptions}\n`;
            prompt += `CRITICAL: Each jewelry piece MUST match its reference image exactly — same chain types, stone shapes, proportions. Do NOT substitute or approximate.\n`;
        }

        // Inject stacking dimension anchors
        const stackAnchors = buildStackingDimensionAnchors(
            products.map(p => ({ category: p.category, dimensions: p.dimensions }))
        );
        if (stackAnchors) prompt += `\n${stackAnchors}\n`;

        prompt += `SCENE: ${artisticDirection}. QUALITY: 8K hyper-realistic rendering, ultra-detailed.`;

        const parts: any[] = [{ text: prompt }];

        // Use bare image instead of raw mannequinBase64 when available
        if (bareImage) {
            const bareData = bareImage.includes('base64,') ? bareImage.split(',')[1] : bareImage;
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: bareData
                }
            });
        } else if (mannequinBase64) {
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: mannequinBase64.includes('base64,') ? mannequinBase64.split(',')[1] : mannequinBase64
                }
            });
        }

        // Fetch and attach all product images
        const productBase64Map: Array<{ base64: string; dataUri: string }> = [];
        for (const product of products) {
            const productBase64 = await fetchImageAsBase64(product.imageUrl);
            productBase64Map.push({ base64: productBase64, dataUri: `data:image/jpeg;base64,${productBase64}` });
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: productBase64 } });
        }

        console.log('[STACK] Calling Gemini API for stacking');
        const response = await callGeminiAPI('gemini-3-pro-image-preview', {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: {
                    imageSize: '4K',
                },
            }
        });

        const extractImage = (resp: any): string | null => {
            for (const part of resp.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
            return null;
        };

        let candidateImage = extractImage(response);
        if (!candidateImage) throw new Error("Aucune image générée pour le stacking.");
        console.log('[STACK] Stacking image generated');

        // --- Pixel validation against first product with blueprint ---
        // Single refinement pass for stacking — use first product with blueprint as reference
        const blueprintIndex = products.findIndex(p => p.blueprint);
        if (blueprintIndex >= 0 && products[blueprintIndex].blueprint) {
            const refProduct = products[blueprintIndex];
            const refDataUri = productBase64Map[blueprintIndex].dataUri;
            console.log('[STACK] Starting AI comparison (gemini-2.5-pro)');

            const aiValidation = await validateJewelryFidelityAI(candidateImage, refDataUri, refProduct.blueprint!);
            console.log(`[STACK-AI] Score: ${aiValidation.score}/10, issues: ${aiValidation.issues.join('; ') || 'none'}`);

            if (aiValidation.passed) {
                console.log('[STACK] AI validation passed — no refinement needed');
                return candidateImage;
            }

            // Single correction pass
            const issueList = aiValidation.issues.join('. ');
            console.log(`[STACK] Refining — fixing: ${issueList}`);

            const currentData = candidateImage.includes('base64,') ? candidateImage.split(',')[1] : candidateImage;
            const correctionParts: any[] = [
                { text: `The jewelry in this photo has these problems vs the references: ${issueList}. Regenerate with jewelry EXACTLY matching the reference images. Fix the listed problems. Keep the model identical.` },
            ];
            // Product images first for reference priority
            for (const pm of productBase64Map) {
                correctionParts.push({ inlineData: { mimeType: 'image/jpeg', data: pm.base64 } });
            }
            correctionParts.push({ inlineData: { mimeType: 'image/png', data: currentData } });

            const correctionResponse = await callGeminiAPI('gemini-3-pro-image-preview', {
                contents: [{ parts: correctionParts }],
                generationConfig: {
                    responseModalities: ['IMAGE', 'TEXT'],
                    imageConfig: { imageSize: '4K' },
                    temperature: 0.2,
                }
            });

            const correctedImage = extractImage(correctionResponse);
            if (correctedImage) {
                console.log('[STACK] Refinement pass complete');
                return correctedImage;
            }
            console.log('[STACK] Refinement produced no image — returning original');
            return candidateImage;
        }

        return candidateImage;
    });
};

/**
 * Analyze a production reference photo and extract a reusable scene/style prompt.
 * Deliberately excludes specific jewelry details and model identity.
 */
export const analyzeProductionReference = async (
    imageBase64: string,
    extractionLevel: ExtractionLevel
): Promise<string> => {
    const mimeType = imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg'
        : imageBase64.startsWith('data:image/webp') ? 'image/webp'
        : 'image/png';
    const imageData = imageBase64.includes('base64,')
        ? imageBase64.split(',')[1]
        : imageBase64;

    const promptMap: Record<ExtractionLevel, string> = {
        'scene-pose-style': `You are a professional photography director. Analyze this jewelry/fashion production photo and write a PRODUCTION DIRECTIVE that could recreate this exact scene with a DIFFERENT model wearing DIFFERENT jewelry.

Extract and describe as imperative instructions:
1. SCENE & SETTING: Background environment, props, surfaces, colors, textures. Be very specific (e.g., "Use a matte marble surface with warm grey veining" not just "marble background").
2. LIGHTING: Direction, quality (hard/soft), color temperature, number of light sources, shadow characteristics, highlights, reflections.
3. POSE & FRAMING: Model's body position, camera angle, crop (close-up/medium/full), composition, negative space.
4. PHOTOGRAPHY STYLE: Genre (editorial, commercial, lifestyle, fine art), color grading, contrast level, mood, overall aesthetic.

CRITICAL EXCLUSIONS — do NOT describe:
- The specific jewelry pieces (type, design, material, brand)
- The model's identity, face, ethnicity, or distinctive physical features
- Any brand or product identifiers

Write as a concise, actionable production directive using imperative language ("Position the model...", "Light the scene with...", "Frame as...").`,

        'scene-pose-style-placement': `You are a professional jewelry photography director. Analyze this jewelry production photo and write a PRODUCTION DIRECTIVE that could recreate this exact scene with a DIFFERENT model wearing DIFFERENT jewelry.

Extract and describe as imperative instructions:
1. SCENE & SETTING: Background environment, props, surfaces, colors, textures. Be very specific.
2. LIGHTING: Direction, quality, color temperature, number of sources, shadow style, highlight placement, how light interacts with reflective surfaces.
3. POSE & FRAMING: Model's body position, camera angle, crop, composition, negative space.
4. PHOTOGRAPHY STYLE: Genre, color grading, contrast, mood, overall aesthetic.
5. JEWELRY SHOWCASE TECHNIQUE: How the jewelry is presented and highlighted — angles that emphasize sparkle or detail, hand/neck/ear positioning to showcase pieces, how the body is oriented to give jewelry prominence, framing choices that draw the eye to adornment zones. Describe the TECHNIQUE of showcasing, NOT the jewelry itself.

CRITICAL EXCLUSIONS — do NOT describe:
- The specific jewelry pieces (type, design, material, gemstones, brand)
- The model's identity, face, ethnicity, or distinctive physical features
- Any brand or product identifiers

Write as a concise, actionable production directive using imperative language ("Angle the model's wrist toward camera to showcase the bracelet zone...", "Light from 45° above to create sparkle on adornment areas...").`,

        'full': `You are a senior creative director for luxury jewelry photography. Analyze this production photo in exhaustive detail and write a comprehensive PRODUCTION DIRECTIVE that could recreate this exact visual with a DIFFERENT model wearing DIFFERENT jewelry.

Extract and describe as imperative instructions:
1. SCENE & SETTING: Background environment, props, surfaces, colors, textures, depth layers, any set design elements. Be extremely specific.
2. LIGHTING: Direction, quality, color temperature, number of sources, shadow characteristics, highlight placement, rim lighting, fill lighting, how light interacts with skin and reflective surfaces, any colored gels or filters.
3. POSE & BODY LANGUAGE: Exact body position, weight distribution, hand placement, head tilt, gaze direction, emotional expression, gesture, tension/relaxation in the body.
4. PHOTOGRAPHY STYLE: Genre, color grading, contrast curve, saturation, film stock emulation, lens characteristics (bokeh, focal length feel), overall aesthetic.
5. CLOTHING & STYLING: Garment types, fabric textures, colors, how clothing drapes, neckline style, sleeve type — describe everything the model is wearing EXCEPT jewelry.
6. MAKEUP & BEAUTY: Skin finish (matte/dewy/natural), eye makeup style, lip color, blush placement, overall beauty direction.
7. MOOD & ATMOSPHERE: Emotional tone, visual storytelling, luxury level, season/time feeling, editorial vs commercial intent.
8. JEWELRY SHOWCASE TECHNIQUE: How adornment zones are presented — angles, body positioning, light placement for sparkle, framing that draws attention to where jewelry sits. Describe the TECHNIQUE only, not the jewelry.

CRITICAL EXCLUSIONS — do NOT describe:
- The specific jewelry pieces (type, design, material, gemstones, brand, color of the jewelry)
- The model's identity, face shape, ethnicity, age, or any identifying physical features
- Any brand names, logos, or product identifiers

Write as a detailed, actionable production directive using imperative language. This directive will be used to recreate the same visual atmosphere with completely different talent and products.`,
    };

    const analysisPrompt = promptMap[extractionLevel];
    let extractedText = '';
    const analysisModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-3-pro-image-preview'];

    for (const model of analysisModels) {
        try {
            const response = await callGeminiAPI(model, {
                contents: [{
                    parts: [
                        { text: analysisPrompt },
                        { inlineData: { mimeType, data: imageData } },
                    ],
                }],
                generationConfig: { responseModalities: ['TEXT'] },
            });
            const extracted = response.candidates?.[0]?.content?.parts
                ?.filter((p: any) => p.text)
                ?.map((p: any) => p.text)
                ?.join('') || '';
            if (extracted.length > 30) {
                extractedText = extracted;
                console.log(`[REF-ANALYZE] Scene extracted via ${model} (${extractionLevel}):`, extractedText.substring(0, 200));
                break;
            }
        } catch (err: any) {
            console.warn(`[REF-ANALYZE] Analysis failed with ${model}:`, err?.message || err);
        }
    }

    if (!extractedText) {
        throw new Error('Failed to analyze production reference photo — all models failed.');
    }

    return extractedText;
};

/**
 * Generate a bare mannequin (no jewelry) with pose-specific framing for a given category.
 * Used as the first step of the two-pass pipeline: bare pose → dress with jewelry.
 */
export const generateBareMannequin = async (
    mannequinBase64: string,
    artisticDirection: string,
    poseKey: PoseKey,
    category: string
): Promise<string> => {
    console.log(`[BARE] Generating bare mannequin — pose: ${poseKey}, category: ${category}`);
    return withRetry(async () => {
        const poseFraming: Record<PoseKey, string> = {
            neck: 'Bust shot, neck and upper chest clearly visible, face or 3/4 angle',
            ear: 'Head tilted 3/4 profile, ear clearly visible, hair pulled back behind the ear',
            wrist: 'Upper body with one forearm and wrist clearly visible, relaxed hand',
            hand: 'Close-up of hands, fingers relaxed and spread naturally, well-lit',
        };

        let prompt = `Luxury commercial photography. 4K RESOLUTION. `;
        prompt += `TECHNICAL MANDATE — BIOMETRIC RECONSTRUCTION: You are a high-end Digital Double specialist. Reconstruct the EXACT physical identity of the subject in the reference image. BIOMETRIC CONSTRAINTS: (1) Bone Structure — match the precise jawline, cheekbone height, and brow ridge geometry. (2) Ocular Detail — replicate eye shape, iris color intensity, and the specific fold of the eyelids. (3) Identity Marks — retain all defining characteristics: specific wrinkles, skin pores, moles, and authentic hairline. (4) The subject must be 100% recognizable as the INDIVIDUAL in the reference photo. `;
        prompt += `POSE & FRAMING: ${poseFraming[poseKey]}. `;
        prompt += `CRITICAL: The model must NOT wear ANY jewelry whatsoever. Bare skin on neck, ears, wrists, fingers. No necklace, no earrings, no rings, no bracelets, no accessories. `;
        prompt += `SCENE: ${artisticDirection}. QUALITY: 8K hyper-realistic rendering, ultra-detailed.`;

        const imageData = mannequinBase64.includes('base64,') ? mannequinBase64.split(',')[1] : mannequinBase64;

        const parts: any[] = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: imageData,
                },
            },
        ];

        const response = await callGeminiAPI('gemini-3-pro-image-preview', {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: { imageSize: '4K' },
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        throw new Error('No image generated for bare mannequin.');
    });
};

/**
 * Dress a bare mannequin with a specific jewelry piece.
 * Second step of the two-pass pipeline: focuses purely on jewelry placement fidelity.
 */
export const dressWithJewelry = async (
    bareBase64: string,
    productBase64: string,
    blueprint: JewelryBlueprint | null,
    dimensions: ProductDimensions | null,
    category: string
): Promise<string> => {
    console.log(`[DRESS] Dressing bare mannequin with jewelry — category: ${category}`);
    return withRetry(async () => {
        // Build placement instruction based on category
        const categoryLower = category.toLowerCase();
        let placement = '';
        if (categoryLower.includes('sautoir-long')) {
            placement = 'Very long sautoir hanging to navel level.';
        } else if (categoryLower.includes('sautoir')) {
            placement = 'Sautoir hanging to mid-chest/sternum level.';
        } else if (categoryLower.includes('collier') || categoryLower.includes('necklace')) {
            placement = 'Necklace on collarbone.';
        } else if (categoryLower.includes('bague') || categoryLower.includes('ring')) {
            placement = 'Ring on finger.';
        } else if (categoryLower.includes('boucles') || categoryLower.includes('earring')) {
            placement = 'Earrings on earlobes, hair back.';
        } else if (categoryLower.includes('bracelet')) {
            placement = 'Bracelet on wrist.';
        }

        // Concise prompt — let the reference image do the heavy lifting
        let prompt = `Image 1 is the JEWELRY REFERENCE (packshot). Image 2 is the MODEL. Place this EXACT jewelry on the model. COPY every detail from the reference: exact chain links, exact stone shapes/colors/settings, exact pendant forms, exact metal finish. Do NOT simplify, approximate, or reinterpret any element. ${placement}`;

        if (blueprint) {
            prompt += ` Key details: ${blueprint.rawDescription}`;
        }

        if (dimensions) {
            const anchors = buildDimensionAnchors(dimensions, category);
            if (anchors) prompt += ` ${anchors}`;
        }

        prompt += ` Do NOT alter the model. 4K resolution.`;

        const bareData = bareBase64.includes('base64,') ? bareBase64.split(',')[1] : bareBase64;
        const productData = productBase64.includes('base64,') ? productBase64.split(',')[1] : productBase64;

        // IMPORTANT: Product image FIRST (image 1) so Gemini focuses on the jewelry reference
        const parts: any[] = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: productData,
                },
            },
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: bareData,
                },
            },
        ];

        const response = await callGeminiAPI('gemini-3-pro-image-preview', {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: { imageSize: '4K' },
                temperature: 0.2,
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }
        throw new Error('No image generated for jewelry dressing.');
    });
};

/**
 * AI-based jewelry fidelity validation using Gemini Flash.
 * Compares the generated photo against the product reference and returns a score + specific issues.
 */
interface AIValidationResult {
    score: number;       // 1-10
    passed: boolean;     // score >= 7
    issues: string[];    // specific differences found
}

const validateJewelryFidelityAI = async (
    generatedImage: string,
    productReference: string,
    blueprint: JewelryBlueprint | null,
): Promise<AIValidationResult> => {
    const genData = generatedImage.includes('base64,') ? generatedImage.split(',')[1] : generatedImage;
    const refData = productReference.includes('base64,') ? productReference.split(',')[1] : productReference;
    const genMime = generatedImage.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
    const refMime = productReference.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';

    const prompt = `You are a jewelry quality inspector. Compare the jewelry in Image 1 (product reference/packshot) with the jewelry worn by the model in Image 2 (generated photo).

Score the fidelity from 1-10 where 10 = perfect reproduction. Focus ONLY on the jewelry, ignore background/model differences.

Check these specific aspects:
- Chain type and link pattern (same or different?)
- Stone shapes, cuts, and colors (same or different?)
- Pendant/charm shapes and proportions (same or different?)
- Metal color and finish (same or different?)
- Number of elements (same count of charms, stones, etc.?)
- Overall proportions and scale

Return ONLY valid JSON, no markdown:
{"score": <1-10>, "issues": ["<specific difference 1>", "<specific difference 2>"]}

If the jewelry is a faithful reproduction (even if angle/lighting differ), score 7+. Only list issues that are actual differences in the jewelry itself.${blueprint ? ` Key details to check: ${blueprint.rawDescription}` : ''}`;

    try {
        const response = await callGeminiAPI('gemini-2.5-pro', {
            contents: [{
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType: refMime, data: refData } },
                    { inlineData: { mimeType: genMime, data: genData } },
                ],
            }],
            generationConfig: { responseModalities: ['TEXT'] },
        });

        const rawText = response.candidates?.[0]?.content?.parts
            ?.filter((p: any) => p.text)
            ?.map((p: any) => p.text)
            ?.join('') || '';

        const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);
        const score = Math.max(1, Math.min(10, parsed.score || 1));
        const issues: string[] = Array.isArray(parsed.issues) ? parsed.issues : [];

        return { score, passed: score >= 7, issues };
    } catch (err: any) {
        console.warn('[AI-VALID] Parse error, assuming pass:', err?.message);
        return { score: 7, passed: true, issues: [] };
    }
};

/**
 * Segment jewelry in an image — returns bounding box and mask for the jewelry region.
 * Uses text-only model for fast structured output (no withRetry needed).
 */
export const segmentJewelry = async (
    imageBase64: string
): Promise<SegmentationResult> => {
    console.log('[SEGMENT] Segmenting jewelry in image');

    const mimeType = imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg'
        : imageBase64.startsWith('data:image/webp') ? 'image/webp'
        : 'image/png';
    const imageData = imageBase64.includes('base64,') ? imageBase64.split(',')[1] : imageBase64;

    try {
        const response = await callGeminiAPI('gemini-2.5-flash', {
            contents: [{
                parts: [
                    {
                        text: 'Identify the jewelry piece(s) in this image. Return a JSON object with exactly two fields: "box_2d" as [y0, x0, y1, x1] normalized 0-1000 (where 0 is top/left, 1000 is bottom/right), and "label" as a short description. If multiple pieces, return ONE bounding box encompassing ALL jewelry. Return ONLY valid JSON, no markdown, no extra fields.',
                    },
                    {
                        inlineData: { mimeType, data: imageData },
                    },
                ],
            }],
            generationConfig: { responseModalities: ['TEXT'] },
        });

        const rawText = response.candidates?.[0]?.content?.parts
            ?.filter((p: any) => p.text)
            ?.map((p: any) => p.text)
            ?.join('') || '';

        // Strip markdown fences if present despite instructions
        const cleaned = rawText.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);

        console.log(`[SEGMENT] Result — label: ${parsed.label}, box: [${parsed.box_2d}]`);

        return {
            box_2d: parsed.box_2d as [number, number, number, number],
            mask: '',
            label: parsed.label || 'jewelry',
        };
    } catch (err: any) {
        console.warn('[SEGMENT] Parse error, returning full-image fallback:', err?.message || err);
        return {
            box_2d: [0, 0, 1000, 1000],
            mask: '',
            label: 'jewelry (fallback)',
        };
    }
};

/**
 * Pre-analyze a jewelry product image to extract a detailed technical blueprint.
 * Used to enrich production prompts for better fidelity.
 */
export const analyzeJewelryProduct = async (
    productImageBase64: string
): Promise<JewelryBlueprint> => {
    const imageData = productImageBase64.includes('base64,')
        ? productImageBase64.split(',')[1]
        : productImageBase64;
    const mimeType = productImageBase64.startsWith('data:image/jpeg') ? 'image/jpeg'
        : productImageBase64.startsWith('data:image/webp') ? 'image/webp'
        : 'image/png';

    const prompt = `You are an expert gemologist and jewelry appraiser. Analyze this jewelry product image with EXTREME precision. Describe every physical detail as if writing a certificate of authenticity.

Return a JSON object with these fields:
{
  "material": "exact metal type and color (e.g., 'yellow gold', 'white gold rhodium-plated', 'sterling silver oxidized')",
  "chainType": "exact chain/link type (e.g., 'cable chain 1mm', 'curb chain 3mm', 'snake chain', 'box chain', 'rope chain', 'none' if no chain)",
  "stoneShape": "exact stone cut shapes present (e.g., 'square princess-cut', 'round brilliant', 'pear drop', 'marquise', 'oval cabochon', 'none' if no stones)",
  "stoneSetting": "how stones are set (e.g., 'four-prong claw setting', 'bezel/clos setting', 'pavé micro-setting', 'channel setting', 'none')",
  "pendantShape": "pendant/charm shape and proportions (e.g., 'circular medallion 15mm diameter', 'rectangular bar 5x20mm', 'none' if no pendant)",
  "finish": "surface treatment (e.g., 'high polish mirror', 'brushed matte satin', 'hammered texture', 'mixed polish and matte')",
  "colorDetails": "all colors visible (e.g., 'warm yellow gold chain, deep green emerald stones, white diamond accents')",
  "rawDescription": "A single paragraph (3-5 sentences) describing the COMPLETE piece as you see it, focusing on shapes, textures, proportions, and distinctive visual features. Be extremely specific — mention exact shapes (square NOT round), exact chain patterns, exact setting styles. This description will be used to reproduce the piece visually."
}

CRITICAL: Be EXTREMELY specific about shapes. If stones are square, say SQUARE. If round, say ROUND. If the chain is thick cable, say THICK CABLE. Precision is everything — this will be used to reproduce the piece.

Return ONLY the JSON, no markdown fences.`;

    const response = await callGeminiAPI('gemini-2.5-flash', {
        contents: [{
            parts: [
                { text: prompt },
                { inlineData: { mimeType, data: imageData } },
            ],
        }],
        generationConfig: { responseModalities: ['TEXT'] },
    });

    const text = response.candidates?.[0]?.content?.parts
        ?.filter((p: any) => p.text)
        ?.map((p: any) => p.text)
        ?.join('') || '';

    try {
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);
        return {
            material: parsed.material || 'unknown',
            chainType: parsed.chainType || 'unknown',
            stoneShape: parsed.stoneShape || 'none',
            stoneSetting: parsed.stoneSetting || 'none',
            pendantShape: parsed.pendantShape || 'none',
            finish: parsed.finish || 'unknown',
            colorDetails: parsed.colorDetails || '',
            rawDescription: parsed.rawDescription || text,
        };
    } catch {
        return {
            material: 'unknown',
            chainType: 'unknown',
            stoneShape: 'unknown',
            stoneSetting: 'unknown',
            pendantShape: 'unknown',
            finish: 'unknown',
            colorDetails: '',
            rawDescription: text,
        };
    }
};

/**
 * Convert cm dimensions to body-relative placement descriptions.
 * Based on a 1m65 mannequin reference height.
 */
export const buildDimensionAnchors = (
    dimensions: ProductDimensions,
    category: string
): string => {
    const parts: string[] = [];

    if (dimensions.chainLength) {
        const cm = dimensions.chainLength;
        let anchor: string;
        if (cm <= 35) anchor = 'choker length, tight around the neck';
        else if (cm <= 42) anchor = 'princess length, sitting on the collarbone';
        else if (cm <= 50) anchor = 'matinee length, falling to upper chest';
        else if (cm <= 60) anchor = 'opera length, falling to the sternum/mid-chest';
        else if (cm <= 80) anchor = 'long sautoir, falling to the navel area';
        else anchor = 'extra-long sautoir, falling below the navel toward the hips';

        parts.push(`CHAIN LENGTH: ${cm}cm on a 1m65 model = ${anchor}`);
    }

    if (dimensions.pendantSize) {
        const cm = dimensions.pendantSize;
        let anchor: string;
        if (cm <= 1) anchor = 'very small/dainty, smaller than a fingernail';
        else if (cm <= 2) anchor = 'small, approximately thumbnail-sized';
        else if (cm <= 3.5) anchor = 'medium, roughly the width of two fingers';
        else if (cm <= 5) anchor = 'large, approximately palm-width';
        else anchor = 'statement piece, larger than the palm';

        parts.push(`PENDANT SIZE: ${cm}cm = ${anchor}`);
    }

    if (dimensions.chainLength && dimensions.pendantSize) {
        const ratio = dimensions.chainLength / dimensions.pendantSize;
        if (ratio > 20) parts.push('The pendant is very small relative to the chain length — delicate, subtle.');
        else if (ratio > 10) parts.push('The pendant is proportional to the chain — balanced look.');
        else parts.push('The pendant is large relative to the chain — statement/bold pendant.');
    }

    return parts.length > 0 ? `DIMENSION ANCHORS (based on 1m65 mannequin):\n${parts.join('\n')}` : '';
};

/**
 * Build relative dimension descriptions for stacking multiple pieces.
 */
export const buildStackingDimensionAnchors = (
    products: Array<{ category: string; dimensions?: ProductDimensions }>
): string => {
    const withChains = products.filter(p => p.dimensions?.chainLength);
    if (withChains.length < 2) return '';

    const sorted = [...withChains].sort((a, b) => (a.dimensions!.chainLength!) - (b.dimensions!.chainLength!));
    const comparisons: string[] = [];

    for (let i = 1; i < sorted.length; i++) {
        const prev = sorted[i - 1];
        const curr = sorted[i];
        const ratio = curr.dimensions!.chainLength! / prev.dimensions!.chainLength!;
        comparisons.push(
            `${curr.category} chain (${curr.dimensions!.chainLength}cm) is ${ratio.toFixed(1)}x longer than ${prev.category} chain (${prev.dimensions!.chainLength}cm)`
        );
    }

    return comparisons.length > 0
        ? `RELATIVE PROPORTIONS:\n${comparisons.join('\n')}`
        : '';
};

/**
 * Refine a generated mannequin image using Gemini's image-to-image capabilities.
 * Sends the current image + a modification prompt to generate a refined version.
 */
export const refineMannequinImage = async (
    currentImageBase64: string,
    refinementType: RefinementType,
    parameters: Record<string, string>
): Promise<string> => {
    return withRetry(async () => {
        const promptMap: Record<RefinementType, string> = {
            hair_tone: `This is a fashion portrait. Change ONLY the model's hair color to ${parameters.color}. The hair should look natural with the new color — proper highlights, lowlights, and root color. CRITICAL: Keep the face, skin, pose, clothing, background, and lighting EXACTLY identical. Output the modified image.`,

            hair_style: `This is a fashion portrait. Change ONLY the model's hairstyle to ${parameters.style || 'a new style'}. Keep the hair color the same. CRITICAL: Keep the face, skin, pose, clothing, background, and lighting EXACTLY identical. Output the modified image.`,

            skin_retouching: `This is a fashion portrait. Adjust the skin retouching level. Current level: ${parameters.level}%. At 0%: Show completely raw, unretouched skin with all natural pores, texture, redness, and imperfections. At 50%: Light retouching, pores still visible but softened. At 100%: Full magazine-level airbrushing, smooth and flawless. Apply the ${parameters.level}% level. Keep face structure, hair, pose, clothing, and background IDENTICAL.`,

            scene_background: `Change ONLY the background of this fashion portrait to: ${parameters.scene}. Keep the model (face, hair, pose, clothing, body position) EXACTLY the same. Only replace the background environment.`,

            outfit_swap: `Fashion styling task. The first image is the model reference. The second image is a garment/outfit. Dress the model in the garment from the second image. The model must keep EXACTLY the same: face, hair, skin, pose, body proportions. The garment should fit naturally on the model's body with realistic draping and folds. Maintain the original background and lighting.`,

            lighting_change: `Change the lighting of this fashion portrait to ${parameters.style} lighting. ${
                parameters.style === 'soft' ? 'Soft diffused light, minimal shadows, gentle and flattering.' :
                parameters.style === 'studio' ? 'Professional studio lighting with key light and fill, controlled and even.' :
                'Dramatic chiaroscuro lighting, deep shadows on one side, cinematic and moody.'
            } Keep the model, pose, clothing, and background identical. Only modify the lighting quality and direction.`,

            add_accessory: `Add ${parameters.accessory} to the model in this fashion portrait. The accessory should look natural and properly placed. Keep everything else (face, hair, pose, clothing, background, lighting) EXACTLY identical.`,

            makeup_change: `Change the model's makeup in this fashion portrait to ${parameters.style} style. ${
                parameters.style === 'natural' ? 'Barely-there makeup, skin texture fully visible, natural brows, nude lips.' :
                parameters.style === 'editorial' ? 'Artistic bold makeup, graphic eyeliner, creative color choices, fashion-forward.' :
                parameters.style === 'glamour' ? 'Evening glamour makeup, smoky eyes, defined lips, contouring, radiant finish.' :
                'Bold and dramatic makeup, strong colors, high-impact look.'
            } Keep everything else (face structure, hair, pose, clothing, background) EXACTLY identical.`,

            style_transfer: `Apply ${parameters.style} photography style to this fashion portrait. ${
                parameters.style === 'editorial' ? 'High-fashion editorial magazine look, dramatic and artistic.' :
                parameters.style === 'vintage' ? 'Vintage film photography aesthetic, warm tones, slight grain, nostalgic feel.' :
                parameters.style === 'film' ? 'Analog film look, Kodak Portra colors, natural grain, warm highlights, faded blacks.' :
                'Clean minimalist photography, neutral tones, simple and elegant.'
            } Maintain the same subject, pose, and composition.`,
        };

        const prompt = promptMap[refinementType];

        const parts: any[] = [
            { text: prompt },
            {
                inlineData: {
                    mimeType: 'image/png',
                    data: currentImageBase64.includes('base64,')
                        ? currentImageBase64.split(',')[1]
                        : currentImageBase64,
                },
            },
        ];

        // For outfit swap, include the garment image
        if (refinementType === 'outfit_swap' && parameters.garmentBase64) {
            parts.push({
                inlineData: {
                    mimeType: 'image/jpeg',
                    data: parameters.garmentBase64.includes('base64,')
                        ? parameters.garmentBase64.split(',')[1]
                        : parameters.garmentBase64,
                },
            });
        }

        const response = await callGeminiAPI('gemini-3-pro-image-preview', {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
            },
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error('No refined image returned by the API.');
    });
};

/**
 * Apply multiple refinements at once in a single API call.
 * No retry — fail fast so the user sees the error immediately.
 */
export const applyBatchRefinements = async (
    currentImageBase64: string,
    selections: RefinementSelections
): Promise<string> => {
    // Build simple human-readable prompt
    const changes: string[] = [];
    if (selections.hairColor) changes.push(`Change hair color to ${selections.hairColor}`);
    if (selections.hairStyle) changes.push(`Change hairstyle to ${selections.hairStyle}`);
    if (selections.hairLengthAdjust) changes.push(selections.hairLengthAdjust);
    if (selections.hairReferenceBase64) changes.push(`Apply the exact haircut and hairstyle shown in the reference photo (additional image provided) to the model. Match the cut, length, texture and styling precisely`);
    if (selections.skinRetouching !== undefined) changes.push(`Set skin retouching to ${selections.skinRetouching}%`);
    if (selections.makeup) changes.push(`Apply ${selections.makeup} makeup style`);
    if (selections.accessory) changes.push(`Add ${selections.accessory}`);
    if (selections.style) changes.push(`Apply ${selections.style} photography style`);
    if (selections.lighting) changes.push(`Change lighting to ${selections.lighting}`);
    if (selections.scene) changes.push(`Change background to: ${selections.scene}`);
    if (selections.outfitBase64) changes.push(`Dress the model in the provided garment (second image)`);

    if (changes.length === 0) throw new Error('No refinements selected.');

    const prompt = `Edit this fashion portrait photo. Make these changes:\n${changes.map(c => `- ${c}`).join('\n')}\n\nKeep the model's face, body proportions, and pose identical. Only change what is listed above. Output the modified image.`;

    console.log('[REFINE] Prompt:', prompt);

    const imageData = currentImageBase64.includes('base64,')
        ? currentImageBase64.split(',')[1]
        : currentImageBase64;

    console.log('[REFINE] Image data size:', Math.round(imageData.length / 1024), 'KB');

    const parts: any[] = [
        { text: prompt },
        { inlineData: { mimeType: 'image/png', data: imageData } },
    ];

    if (selections.outfitBase64) {
        const outfitData = selections.outfitBase64.includes('base64,')
            ? selections.outfitBase64.split(',')[1]
            : selections.outfitBase64;
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: outfitData } });
    }

    if (selections.hairReferenceBase64) {
        const hairData = selections.hairReferenceBase64.includes('base64,')
            ? selections.hairReferenceBase64.split(',')[1]
            : selections.hairReferenceBase64;
        parts.push({ inlineData: { mimeType: 'image/jpeg', data: hairData } });
    }

    // Try multiple models — some may not be available for all API keys
    const MODELS = [
        'gemini-2.5-flash-image',
        'gemini-3-pro-image-preview',
    ];

    const requestBody = {
        contents: [{ parts }],
        generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
        },
    };

    let lastError = '';
    for (const model of MODELS) {
        console.log(`[REFINE] Trying model: ${model}`);
        try {
            const response = await callGeminiAPI(model, requestBody);

            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.inlineData) {
                    console.log(`[REFINE] Success with ${model}, mime:`, part.inlineData.mimeType);
                    return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
                }
            }
            lastError = `${model}: no image in response`;
        } catch (err: any) {
            lastError = `${model}: ${err.message || err}`;
            console.warn(`[REFINE] ${model} failed:`, lastError);
            continue;
        }
    }

    throw new Error(`Refinement failed on all models. Last: ${lastError.substring(0, 150)}`);
};
