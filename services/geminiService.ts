import { ExtractionResult, MannequinCriteria, RefinementType, RefinementSelections, ExtractionLevel } from "../types";

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

export const generateProductionPhoto = async (
    mannequinBase64: string | null,
    productUrl: string,
    artisticDirection: string,
    category: string = ''
): Promise<string> => {
    console.log('[PRODUCTION] Starting generation');
    return withRetry(async () => {
        let productBase64 = await fetchImageAsBase64(productUrl);
        console.log('[PRODUCTION] Product image loaded');

        let prompt = `Luxury commercial photography. 4K RESOLUTION. The product ${category ? `(${category})` : ''} is the centerpiece. `;
        if (mannequinBase64) {
            prompt += `MANNEQUIN: Identical to reference (face, hair, vibe). Editorial pose. Product worn realistically. `;
        } else {
            prompt += `MANNEQUIN: Worn by a realistic model. `;
        }

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

        prompt += `SCENE: ${artisticDirection}. QUALITY: 8K hyper-realistic rendering, ultra-detailed.`;

        const parts: any[] = [{ text: prompt }];
        if (mannequinBase64) {
            parts.push({
                inlineData: {
                    mimeType: "image/png",
                    data: mannequinBase64.includes('base64,') ? mannequinBase64.split(',')[1] : mannequinBase64
                }
            });
        }
        parts.push({
            inlineData: {
                mimeType: "image/jpeg",
                data: productBase64
            }
        });

        console.log('[PRODUCTION] Calling Gemini API');

        const response = await callGeminiAPI('gemini-3-pro-image-preview', {
          contents: [{ parts }],
          generationConfig: {
            responseModalities: ['IMAGE', 'TEXT'],
            imageConfig: {
              imageSize: '4K',
            },
          }
        });

        console.log('[PRODUCTION] API Response received');

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error("Aucune image générée.");
    });
};

/**
 * Generate a production photo with multiple jewelry pieces stacked on the same mannequin.
 */
export const generateStackedProductionPhoto = async (
    mannequinBase64: string | null,
    products: Array<{ imageUrl: string; category: string; name: string }>,
    artisticDirection: string
): Promise<string> => {
    return withRetry(async () => {
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

        const productDescriptions = products.map((p, i) => {
            const catLower = (p.category || p.name || '').toLowerCase();
            const placement = Object.entries(placementMap).find(([key]) => catLower.includes(key));
            return `Product ${i + 1} (image ${mannequinBase64 ? i + 2 : i + 1}): ${p.category || p.name || 'jewelry'} — ${placement?.[1] || 'worn naturally on the model'}`;
        }).join('\n');

        let prompt = `Luxury commercial photography. 4K RESOLUTION. MULTIPLE JEWELRY STACKING — place ALL the following products on the SAME model simultaneously:\n${productDescriptions}\n\n`;

        if (mannequinBase64) {
            prompt += `MANNEQUIN: Identical to the reference model (image 1) — same face, hair, skin, pose. `;
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

        prompt += `SCENE: ${artisticDirection}. QUALITY: 8K hyper-realistic rendering, ultra-detailed.`;

        const parts: any[] = [{ text: prompt }];

        if (mannequinBase64) {
            parts.push({
                inlineData: {
                    mimeType: 'image/png',
                    data: mannequinBase64.includes('base64,') ? mannequinBase64.split(',')[1] : mannequinBase64
                }
            });
        }

        for (const product of products) {
            const productBase64 = await fetchImageAsBase64(product.imageUrl);
            parts.push({ inlineData: { mimeType: 'image/jpeg', data: productBase64 } });
        }

        const response = await callGeminiAPI('gemini-3-pro-image-preview', {
            contents: [{ parts }],
            generationConfig: {
                responseModalities: ['IMAGE', 'TEXT'],
                imageConfig: {
                    imageSize: '4K',
                },
            }
        });

        for (const part of response.candidates?.[0]?.content?.parts || []) {
            if (part.inlineData) {
                return `data:${part.inlineData.mimeType};base64,${part.inlineData.data}`;
            }
        }

        throw new Error("Aucune image générée pour le stacking.");
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
