/**
 * Production Stack Execution Engine
 *
 * Deux flots de génération distincts :
 *
 * FLOT 1 — STACKING DIRECT (renderDirectComposite)
 *   Tous les bijoux sont connus à l'avance → un seul appel Gemini
 *   avec mannequin + N références bijoux dans le même payload.
 *   Utilise editImageWithReferences (generateContent multi-références).
 *
 * FLOT 2 — AJOUTS SÉQUENTIELS (renderSequentialEdit)
 *   L'utilisateur enrichit progressivement une image existante →
 *   chat conversationnel multi-tour via continueImageChatSession.
 *   Chaque ajout préserve strictement le contenu déjà validé.
 *
 * Le routing est explicite via resolveGenerationFlow().
 */

import {
  ProductionStackSession, StackLayer, GenerationSnapshot, StepState,
  ImageChatSession, ImageGenerationConfig, ReferenceImage, ReferenceBundle,
  EffectiveBundle, PixelFidelityResult, SizePreset,
} from '../types';
import {
  editImageWithReferences,
  createImageChatSession,
  continueImageChatSession,
  getZonePlacementPrompt,
  extractBase64,
  fetchImageAsBase64,
  IMAGE_MODEL,
  parseImageResponse,
} from './geminiService';

// ═══════════════════════════════════════════════════════════════
// ROUTING — resolveGenerationFlow
// ═══════════════════════════════════════════════════════════════

export type GenerationFlow = 'direct' | 'sequential';

/**
 * Décide quel pipeline Gemini utiliser.
 *
 * DIRECT  → tous les bijoux sont là, aucune étape n'est encore complétée.
 *           On fait un seul appel multi-références.
 *
 * SEQUENTIAL → une image composite existe déjà (au moins une étape a été
 *              complétée ou l'utilisateur ajoute un bijou après coup).
 *              On utilise un chat conversationnel pour enrichir.
 */
export function resolveGenerationFlow(session: ProductionStackSession): GenerationFlow {
  const hasExistingComposite = session.currentImage !== null && session.currentImage !== session.baseImage;
  const hasCompletedSteps = session.stepStates.some(s => s.status === 'completed');

  if (hasExistingComposite || hasCompletedSteps) {
    return 'sequential';
  }

  return 'direct';
}

// ═══════════════════════════════════════════════════════════════
// SYSTÈME DE TAILLE INTELLIGENT
// ═══════════════════════════════════════════════════════════════

const SIZE_CONFIG: Record<SizePreset, { ratio: number; promptFr: string; promptEn: string }> = {
  very_small: {
    ratio: 0.6,
    promptFr: 'nettement plus petit que la taille standard',
    promptEn: 'noticeably smaller than standard scale — delicate, fine jewelry proportion',
  },
  small: {
    ratio: 0.8,
    promptFr: 'légèrement plus petit que la taille standard',
    promptEn: 'slightly smaller than standard scale — subtle and refined proportion',
  },
  medium: {
    ratio: 1.0,
    promptFr: 'taille standard naturelle',
    promptEn: 'natural standard scale relative to the model\'s neck and collarbone width',
  },
  large: {
    ratio: 1.25,
    promptFr: 'légèrement plus grand que la taille standard',
    promptEn: 'slightly larger than standard scale — statement piece proportion, while remaining physically realistic',
  },
};

export { SIZE_CONFIG };

function getSizeInstruction(preset: SizePreset): string {
  const cfg = SIZE_CONFIG[preset];
  return `SCALE: The jewelry should appear ${cfg.promptEn}. Scale ratio relative to collarbone width: ${cfg.ratio}x.`;
}

// ═══════════════════════════════════════════════════════════════
// PROMPT BUILDER — RENDU JOAILLERIE ULTRA HAUT DE GAMME
// ═══════════════════════════════════════════════════════════════

/**
 * Construit un prompt de qualité production pour le rendu de bijoux
 * photoréalistes. Chaque bloc cible un aspect spécifique du réalisme.
 *
 * Le résultat doit être indistinguable d'une vraie photo de campagne
 * joaillerie haut de gamme.
 */
export function buildLuxuryJewelryPrompt(opts: {
  layers: StackLayer[];
  mode: 'direct' | 'sequential';
  isFirstTurn?: boolean;
  currentLayerIndex?: number;
}): string {
  const { layers, mode, isFirstTurn = true, currentLayerIndex } = opts;

  // Pour le mode séquentiel, on ne décrit que le calque courant
  const activeLayers = mode === 'sequential' && currentLayerIndex !== undefined
    ? [layers[currentLayerIndex]]
    : layers;

  // ── A. PRÉSERVATION ABSOLUE DE L'IMAGE ──
  const preservation = [
    '== IMAGE PRESERVATION (ABSOLUTE) ==',
    'Preserve EXACTLY and without ANY modification:',
    '- Face, expression, eyes, skin texture, makeup',
    '- Hair (style, color, position, strands)',
    '- Body pose, posture, hand position',
    '- Clothing (fabric, folds, color, texture)',
    '- Lighting setup (direction, intensity, color temperature, shadows)',
    '- Background (blur, color, texture, objects)',
    '- Camera framing, angle, depth of field',
    '- Overall color grading and photo grain',
    'The model must look IDENTICAL to the input — not "similar", IDENTICAL.',
  ];

  // ── B. FIDÉLITÉ ABSOLUE DU BIJOU ──
  const fidelity = [
    '',
    '== JEWELRY FIDELITY (ABSOLUTE) ==',
    'Each jewelry reference image must be reproduced with EXACT fidelity:',
    '- Precise shape, proportions, silhouette — no reinterpretation',
    '- Exact chain structure: link type, link size, link pattern, chain width',
    '- Pendant: exact shape, exact stone arrangement, exact setting style',
    '- Metal: exact color (gold/silver/rose), exact finish (polished/matte/brushed)',
    '- Stones: exact color, exact cut shape, exact number, exact arrangement',
    '- Fine details: clasps, engravings, textures, surface patterns',
    'DO NOT simplify, stylize, smooth, merge, or reinterpret any design element.',
    'The jewelry in the output must be recognizable as the SAME piece from the reference.',
  ];

  // ── C. PHYSIQUE RÉALISTE (CRITIQUE) ──
  const physics = [
    '',
    '== REALISTIC PHYSICS (CRITICAL) ==',
    'The jewelry must obey real-world physics as if physically worn:',
    '- Chain follows the natural curve of the neck and collarbone',
    '- Chain rests ON the skin with visible contact — not floating above it',
    '- Natural tension: slight sag between anchor points, not rigid or geometric',
    '- Pendant hangs vertically under gravity from its attachment point',
    '- Pendant shows real weight: slight swing, natural depth, not flat against chest',
    '- Micro-shadows under the chain and pendant where they contact skin',
    '- Correct perspective matching the body angle and camera position',
    '- Depth and volume: jewelry is a 3D object, not a flat overlay',
    'FORBIDDEN: floating jewelry, sticker effect, Photoshop overlay look, rigid geometry.',
  ];

  // ── D. INTÉGRATION VISUELLE PREMIUM ──
  const integration = [
    '',
    '== VISUAL INTEGRATION (PREMIUM) ==',
    '- Match the EXACT lighting of the scene: highlights on metal must come from the same light source as highlights on skin',
    '- Match shadow direction and softness with existing body shadows',
    '- Match color temperature: warm/cool cast must be consistent',
    '- Match photo grain and sharpness: jewelry should not look "cleaner" than the rest of the image',
    '- Match contrast and dynamic range of the photograph',
    '- Subtle skin-metal interaction: faint warm reflection on metal from skin, faint cool reflection on skin from metal',
    'The final result must look like the jewelry was physically present during the photoshoot.',
    'NOT like it was added afterwards. NOT like AI generation. Like a REAL photograph.',
  ];

  // ── E. PLACEMENT ET TAILLE PAR CALQUE ──
  const placements = activeLayers.map((layer, i) => {
    const zone = getZonePlacementPrompt(layer.targetZone);
    const size = getSizeInstruction(layer.sizePreset || 'medium');
    return `\nJewelry ${i + 1}: "${layer.name}" (${layer.productCategory})\n${zone}\n${size}`;
  });

  // ── F. STACKING (si plusieurs bijoux) ──
  const stacking = activeLayers.length > 1 ? [
    '',
    '== MULTI-JEWELRY STACKING ==',
    '- Clear visual hierarchy: shorter necklaces closer to neck, longer ones lower',
    '- Natural spacing between each piece — no collision, no overlap of chains',
    '- Each chain hangs independently with its own gravity and drape',
    '- Each piece must remain individually readable and recognizable',
    '- No fusion between pieces — distinct separation at all points',
  ] : [];

  // ── G. INSTRUCTION DE MODE ──
  const modeInstruction = mode === 'sequential'
    ? [
        '',
        '== INCREMENTAL EDIT MODE ==',
        isFirstTurn
          ? 'The image below is the base photograph to edit.'
          : 'Continue editing the same image from the previous turn.',
        'Add ONLY the new jewelry piece described above.',
        'Preserve ALL previously placed jewelry exactly as-is — do not move, resize, or alter them.',
      ]
    : [
        '',
        '== DIRECT COMPOSITION MODE ==',
        'Image 1 below is the base model photograph.',
        `The following ${activeLayers.length} image(s) are jewelry references — place them ALL in a single composition.`,
      ];

  // ── ASSEMBLAGE FINAL ──
  return [
    'Edit this image to create a professional luxury jewelry campaign photograph.',
    '',
    ...preservation,
    ...fidelity,
    ...physics,
    ...integration,
    ...placements,
    ...stacking,
    ...modeInstruction,
    '',
    'The final image must be indistinguishable from a real high-end jewelry photoshoot.',
  ].join('\n');
}

// ═══════════════════════════════════════════════════════════════
// FLOT 1 — STACKING DIRECT (un seul appel multi-références)
// ═══════════════════════════════════════════════════════════════

/**
 * Génère une composition unique avec mannequin + tous les bijoux
 * dans un seul appel generateContent multi-références.
 *
 * Pattern API : contents = [text, mannequin, bijou1, bijou2, ...]
 */
export async function renderDirectComposite(
  session: ProductionStackSession,
  onProgress: (message: string) => void,
): Promise<string> {
  onProgress('Préparation des références…');

  // 1. Résoudre toutes les images bijoux en base64
  const resolvedLayers: { layer: StackLayer; base64: string }[] = [];
  for (const layer of session.layers) {
    let b64: string;
    if (layer.productImage.startsWith('http')) {
      const raw = await fetchImageAsBase64(layer.productImage);
      b64 = raw;
    } else {
      b64 = extractBase64(layer.productImage);
    }
    resolvedLayers.push({ layer, base64: b64 });
  }

  // 2. Construire le ReferenceBundle structuré
  const baseImageData = extractBase64(session.baseImage);

  const characterRefs: ReferenceImage[] = [{
    id: 'base-mannequin',
    kind: 'character',
    role: 'Photo mannequin de base — ne pas modifier',
    base64: baseImageData,
    mimeType: 'image/png',
    priority: 0,
  }];

  const objectRefs: ReferenceImage[] = resolvedLayers.map(({ layer, base64 }, i) => ({
    id: `jewelry-${layer.id}`,
    kind: 'object' as const,
    role: `Bijou ${i + 1}: ${layer.name} (${layer.productCategory}) → ${layer.targetZone}`,
    base64,
    mimeType: 'image/jpeg',
    priority: i + 1,
  }));

  const bundle: ReferenceBundle = {
    characterReferences: characterRefs,
    objectReferences: objectRefs,
    compositionReferences: [],
    styleReferences: [],
  };

  // 3. Construire le prompt luxury
  const prompt = buildLuxuryJewelryPrompt({
    layers: session.layers,
    mode: 'direct',
  });

  onProgress(`Composition de ${session.layers.length} bijou${session.layers.length > 1 ? 'x' : ''} en cours…`);

  // 4. Un seul appel API multi-références
  const { response, effective } = await editImageWithReferences(prompt, bundle, {
    imageConfig: {
      aspectRatio: session.aspectRatio,
      imageSize: session.imageSize,
    },
  });

  if (response.images.length === 0) {
    throw new Error('Aucune image retournée par le modèle');
  }

  const outputImage = response.images[0].dataUri;

  // 5. Enregistrer le snapshot unique
  const snapshot: GenerationSnapshot = {
    stepIndex: 0,
    layerId: 'direct-composite',
    prompt,
    referencesUsed: effective.included,
    referencesExcluded: effective.excluded,
    generationConfig: {
      imageConfig: {
        imageSize: session.imageSize,
        aspectRatio: session.aspectRatio,
      },
    },
    inputImage: session.baseImage,
    outputImage,
    validation: null,
    timestamp: Date.now(),
    attemptNumber: 1,
  };

  // 6. Mettre à jour la session
  session.currentImage = outputImage;
  session.status = 'completed';
  session.referenceBundle = bundle;
  session.excludedReferences = effective.excluded;

  // Marquer toutes les étapes comme complétées
  for (const stepState of session.stepStates) {
    stepState.status = 'completed';
    stepState.snapshots.push(snapshot);
    stepState.approvedSnapshotIndex = 0;
  }

  onProgress('Composition terminée ✓');
  return outputImage;
}

// ═══════════════════════════════════════════════════════════════
// FLOT 2 — AJOUTS SÉQUENTIELS (chat conversationnel multi-tour)
// ═══════════════════════════════════════════════════════════════

/**
 * Ajoute un bijou à une image existante via chat conversationnel.
 * Préserve le contexte visuel entre les tours.
 *
 * Pattern API : chat multi-tour (contents avec historique cumulé)
 */
export async function renderSequentialEdit(
  session: ProductionStackSession,
  layerIndex: number,
  onProgress: (message: string) => void,
): Promise<string> {
  const layer = session.layers[layerIndex];
  const stepState = session.stepStates[layerIndex];

  onProgress(`Ajout de ${layer.name}…`);

  // 1. Initialiser la session chat si absente
  if (!session.chatSession) {
    session.chatSession = createImageChatSession({
      aspectRatio: session.aspectRatio,
      imageSize: session.imageSize,
    });
  }

  const isFirstTurn = session.chatSession.history.length === 0;

  // 2. Résoudre l'image bijou
  let productBase64: string;
  if (layer.productImage.startsWith('http')) {
    productBase64 = await fetchImageAsBase64(layer.productImage);
  } else {
    productBase64 = extractBase64(layer.productImage);
  }

  // 3. Construire le prompt séquentiel
  const prompt = buildLuxuryJewelryPrompt({
    layers: session.layers,
    mode: 'sequential',
    isFirstTurn,
    currentLayerIndex: layerIndex,
  });

  // 4. Construire les parts du message
  const userParts: any[] = [{ text: prompt }];

  // Au premier tour, inclure l'image de base (ou composite courante)
  if (isFirstTurn && session.currentImage) {
    userParts.push({
      inlineData: { mimeType: 'image/png', data: extractBase64(session.currentImage) },
    });
  }

  // Toujours inclure la référence bijou
  userParts.push({
    inlineData: { mimeType: 'image/jpeg', data: productBase64 },
  });

  // 5. Appel conversationnel
  stepState.status = 'executing';
  stepState.currentAttempt += 1;

  const result = await continueImageChatSession(session.chatSession, userParts);

  if (result.images.length === 0) {
    stepState.status = 'failed';
    stepState.error = 'Aucune image retournée';
    throw new Error('Aucune image retournée par le modèle');
  }

  const outputImage = result.images[0].dataUri;

  // 6. Enregistrer le snapshot
  const snapshot: GenerationSnapshot = {
    stepIndex: layerIndex,
    layerId: layer.id,
    prompt,
    referencesUsed: [{
      id: `seq-jewelry-${layer.id}`,
      kind: 'object',
      role: `${layer.name} (${layer.productCategory})`,
      base64: productBase64,
      mimeType: 'image/jpeg',
      priority: 1,
    }],
    referencesExcluded: [],
    generationConfig: {
      imageConfig: {
        imageSize: session.imageSize,
        aspectRatio: session.aspectRatio,
      },
    },
    inputImage: session.currentImage || session.baseImage,
    outputImage,
    validation: null,
    timestamp: Date.now(),
    attemptNumber: stepState.currentAttempt,
  };

  stepState.snapshots.push(snapshot);
  stepState.approvedSnapshotIndex = stepState.snapshots.length - 1;
  stepState.status = 'completed';

  // 7. Mise à jour session
  session.currentImage = outputImage;

  onProgress(`${layer.name} ajouté ✓`);
  return outputImage;
}

// ═══════════════════════════════════════════════════════════════
// ORCHESTRATEUR PRINCIPAL — executeComposition
// ═══════════════════════════════════════════════════════════════

/**
 * Point d'entrée principal. Route automatiquement vers le bon flot.
 *
 * - Si tous les bijoux sont prêts et aucun n'est déjà placé → DIRECT
 * - Si une image composite existe déjà → SÉQUENTIEL pour les layers non placés
 */
export async function executeComposition(
  session: ProductionStackSession,
  onProgress: (message: string) => void,
  onStepUpdate: (stepIndex: number, state: StepState) => void,
): Promise<void> {
  session.status = 'executing';

  // Initialiser les step states si vides
  if (session.stepStates.length === 0) {
    initializeStepStates(session);
  }

  const flow = resolveGenerationFlow(session);
  console.log(`[STACK-ENGINE] Flow résolu : ${flow} (${session.layers.length} calque(s))`);

  if (flow === 'direct') {
    // ── FLOT 1 : STACKING DIRECT ──
    // Tous les bijoux en un seul appel
    await renderDirectComposite(session, onProgress);

    // Notifier la UI pour chaque step
    for (let i = 0; i < session.stepStates.length; i++) {
      onStepUpdate(i, session.stepStates[i]);
    }
  } else {
    // ── FLOT 2 : AJOUTS SÉQUENTIELS ──
    // Traiter uniquement les layers non encore complétés
    for (let i = 0; i < session.layers.length; i++) {
      const stepState = session.stepStates[i];

      if (stepState.status === 'completed') {
        continue; // déjà placé
      }

      try {
        await renderSequentialEdit(session, i, onProgress);
        onStepUpdate(i, session.stepStates[i]);
      } catch (error: any) {
        session.stepStates[i].status = 'failed';
        session.stepStates[i].error = error.message || String(error);
        onStepUpdate(i, session.stepStates[i]);
        break;
      }
    }
  }

  // Statut final
  const allCompleted = session.stepStates.every(ss => ss.status === 'completed');
  if (allCompleted) {
    session.status = 'completed';
  }
}

// ═══════════════════════════════════════════════════════════════
// UTILITAIRES (conservés de l'ancienne version)
// ═══════════════════════════════════════════════════════════════

export function initializeStepStates(session: ProductionStackSession): void {
  session.stepStates = session.layers.map((layer) => ({
    layerId: layer.id,
    status: 'pending' as const,
    currentAttempt: 0,
    maxAttempts: 3,
    snapshots: [],
    approvedSnapshotIndex: null,
  }));
}

/**
 * Réessayer un calque spécifique.
 * Utilise le flot séquentiel (ajout incrémental sur l'image existante).
 */
export async function retryStep(
  session: ProductionStackSession,
  stepIndex: number,
  onProgress: (message: string) => void,
): Promise<void> {
  const stepState = session.stepStates[stepIndex];
  stepState.status = 'pending';
  stepState.error = undefined;

  // Rembobiner l'image courante au dernier état valide avant cette étape
  if (stepIndex === 0) {
    session.currentImage = session.baseImage;
  } else {
    const prevState = session.stepStates[stepIndex - 1];
    if (prevState.approvedSnapshotIndex !== null) {
      session.currentImage = prevState.snapshots[prevState.approvedSnapshotIndex].outputImage;
    }
  }

  // Réinitialiser le chat pour repartir du bon état
  session.chatSession = null;

  await renderSequentialEdit(session, stepIndex, onProgress);

  // Invalider les étapes suivantes
  for (let i = stepIndex + 1; i < session.stepStates.length; i++) {
    if (session.stepStates[i].status === 'completed') {
      session.stepStates[i].status = 'pending';
      session.stepStates[i].approvedSnapshotIndex = null;
    }
  }
}

/**
 * Édition de suivi conversationnelle — modifications en langage naturel
 * après que la composition est terminée.
 */
export async function sendFollowUpEdit(
  session: ProductionStackSession,
  userPrompt: string,
): Promise<string> {
  if (!session.currentImage) {
    throw new Error('Pas d\'image à modifier');
  }

  // Initialiser le chat si absent
  if (!session.chatSession) {
    session.chatSession = createImageChatSession({
      aspectRatio: session.aspectRatio,
      imageSize: session.imageSize,
    });
  }

  const preserveInstruction =
    'Tu édites une photo de production de bijoux. TOUS les bijoux existants sur le mannequin doivent être PRÉSERVÉS exactement tels quels sauf instruction contraire explicite. Ne PAS retirer, déplacer, redimensionner ou modifier les bijoux déjà placés.';

  const userParts: any[] = [
    { text: `${preserveInstruction}\n\nINSTRUCTION : ${userPrompt}` },
  ];

  // Au premier tour du suivi, inclure l'image actuelle
  if (session.chatSession.history.length === 0) {
    userParts.push({
      inlineData: { mimeType: 'image/png', data: extractBase64(session.currentImage) },
    });
  }

  const result = await continueImageChatSession(session.chatSession, userParts);

  if (result.images.length === 0) {
    throw new Error('Aucune image retournée pour l\'édition de suivi');
  }

  const newImage = result.images[0].dataUri;

  const followUpSnapshot: GenerationSnapshot = {
    stepIndex: -1,
    layerId: 'follow-up',
    prompt: userPrompt,
    referencesUsed: [],
    referencesExcluded: [],
    generationConfig: {
      imageConfig: {
        imageSize: session.imageSize,
        aspectRatio: session.aspectRatio,
      },
    },
    inputImage: session.currentImage,
    outputImage: newImage,
    validation: null,
    timestamp: Date.now(),
    attemptNumber: session.followUpHistory.length + 1,
  };

  session.followUpHistory.push(followUpSnapshot);
  session.currentImage = newImage;

  return newImage;
}

/**
 * Libère la mémoire en supprimant les images des tentatives non approuvées.
 */
export function compactSnapshots(session: ProductionStackSession): void {
  for (const stepState of session.stepStates) {
    for (let i = 0; i < stepState.snapshots.length; i++) {
      if (i !== stepState.approvedSnapshotIndex) {
        stepState.snapshots[i].inputImage = '';
        stepState.snapshots[i].outputImage = '';
      }
    }
  }
}
