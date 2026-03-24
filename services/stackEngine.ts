/**
 * Production Stack Execution Engine
 *
 * Orchestrates progressive sequential jewelry placement on a locked base image.
 * Each step builds on the previous approved result, with full snapshot history
 * for undo, retry, and debugging. Pure service module -- no React hooks, no Zustand.
 */

import {
  ProductionStackSession, StackLayer, GenerationSnapshot, StepState,
  ImageChatSession, ImageGenerationConfig, ReferenceImage, ReferenceBundle,
  EffectiveBundle, PixelFidelityResult,
} from '../types';
import {
  addJewelryToExisting, fetchImageAsBase64, createImageChatSession,
  continueImageChatSession, getZonePlacementPrompt, extractBase64,
} from './geminiService';

// ─── buildStepBundle (STACK-06) ─────────────────────────────────

/**
 * Constructs a ReferenceBundle with explicit roles for a single step.
 * Documents which references play which roles for debugging (UI-08)
 * and reproducibility (STATE-04). The bundle is recorded in the
 * GenerationSnapshot even though addJewelryToExisting handles the
 * actual API call internally.
 */
export function buildStepBundle(
  session: ProductionStackSession,
  layer: StackLayer,
  inputImage: string,
  productBase64: string,
): { bundle: ReferenceBundle; prompt: string } {
  // 1. Base scene reference (highest priority -- locked content)
  const baseRef: ReferenceImage = {
    id: `step-${layer.ordinal}-base`,
    kind: 'character',
    role: 'locked base scene — do NOT modify existing content',
    base64: extractBase64(inputImage),
    mimeType: 'image/png',
    priority: 0,
  };

  // 2. Jewelry fidelity reference
  const jewelryRef: ReferenceImage = {
    id: `step-${layer.ordinal}-jewelry`,
    kind: 'object',
    role: `jewelry fidelity — ${layer.name} (${layer.productCategory})`,
    base64: extractBase64(productBase64),
    mimeType: 'image/jpeg',
    priority: 1,
  };

  // 3. Character consistency reference (only for non-first steps)
  const characterRefs: ReferenceImage[] = [baseRef];
  if (layer.ordinal > 0) {
    const characterRef: ReferenceImage = {
      id: `step-${layer.ordinal}-character`,
      kind: 'character',
      role: 'character consistency — original mannequin identity',
      base64: extractBase64(session.baseImage),
      mimeType: 'image/png',
      priority: 2,
    };
    characterRefs.push(characterRef);
  }

  // 4. Assemble bundle
  const bundle: ReferenceBundle = {
    characterReferences: characterRefs,
    objectReferences: [jewelryRef],
    compositionReferences: [],
    styleReferences: [],
  };

  // 5. Build prompt with placement, locking (STACK-13), and physics (STACK-12)
  const prompt =
    getZonePlacementPrompt(layer.targetZone) +
    ' PLACEMENT LOCK: Do NOT remove, shift, resize, or alter ANY existing jewelry already on the model. Only ADD the new piece.' +
    ' PHYSICS: Correct scale relative to body, realistic drape/hang, no object fusion between jewelry pieces.';

  return { bundle, prompt };
}

// ─── initializeStepStates ───────────────────────────────────────

/**
 * Populates session.stepStates from session.layers.
 */
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

// ─── executeStep (internal) ─────────────────────────────────────

/**
 * Executes a single step: resolves product image, calls addJewelryToExisting,
 * records a GenerationSnapshot, and updates session-level STATE-01 fields.
 */
async function executeStep(
  session: ProductionStackSession,
  stepIndex: number,
  inputImage: string,
): Promise<GenerationSnapshot> {
  const layer = session.layers[stepIndex];
  const stepState = session.stepStates[stepIndex];

  // Update status
  stepState.status = 'executing';
  stepState.currentAttempt += 1;

  // Resolve product image (URL vs data URI)
  let productBase64: string;
  if (layer.productImage.startsWith('http')) {
    const raw = await fetchImageAsBase64(layer.productImage);
    productBase64 = `data:image/jpeg;base64,${raw}`;
  } else {
    productBase64 = layer.productImage;
  }

  // Build reference bundle and prompt (STACK-06)
  const stepBundle = buildStepBundle(session, layer, inputImage, productBase64);

  // Call the core pipeline (dress -> segment -> composite -> harmonize -> pixel validation)
  const outputImage = await addJewelryToExisting(
    inputImage,
    productBase64,
    layer.productCategory,
    layer.blueprint,
    layer.dimensions,
  );

  // Build GenerationSnapshot (STATE-04 — full recording)
  const snapshot: GenerationSnapshot = {
    stepIndex,
    layerId: layer.id,
    prompt: stepBundle.prompt,
    referencesUsed: [
      ...stepBundle.bundle.characterReferences,
      ...stepBundle.bundle.objectReferences,
    ],
    referencesExcluded: [],
    generationConfig: {
      imageConfig: {
        imageSize: session.imageSize,
        aspectRatio: session.aspectRatio,
      },
    },
    inputImage,
    outputImage,
    validation: null,
    timestamp: Date.now(),
    attemptNumber: stepState.currentAttempt,
  };

  // Record snapshot
  stepState.snapshots.push(snapshot);
  stepState.approvedSnapshotIndex = stepState.snapshots.length - 1;
  stepState.status = 'completed';

  // Update session-level STATE-01 fields
  session.referenceBundle = stepBundle.bundle;

  // Flatten excluded refs from all steps
  session.excludedReferences = session.stepStates
    .flatMap((ss) => ss.snapshots)
    .flatMap((snap) => snap.referencesExcluded);

  // Push validation result if available
  if (snapshot.validation) {
    session.validationResults.push(snapshot.validation);
  }

  return snapshot;
}

// ─── executeStackPlan ───────────────────────────────────────────

/**
 * Main orchestrator. Runs progressive sequential edits one piece at a time.
 * Each step calls addJewelryToExisting and records a full GenerationSnapshot.
 * Sequential loop — NEVER parallel (rate limiting).
 */
export async function executeStackPlan(
  session: ProductionStackSession,
  onStepUpdate: (stepIndex: number, state: StepState) => void,
): Promise<void> {
  session.status = 'executing';

  // Initialize step states if empty (supports fresh start)
  if (session.stepStates.length === 0) {
    initializeStepStates(session);
  }

  let currentImage = session.baseImage;

  // Sequential loop through layers
  for (let i = 0; i < session.layers.length; i++) {
    const stepState = session.stepStates[i];

    // Skip already completed steps (supports resume after partial failure)
    if (stepState.status === 'completed') {
      // Use the approved snapshot's output as the current image
      if (stepState.approvedSnapshotIndex !== null) {
        currentImage = stepState.snapshots[stepState.approvedSnapshotIndex].outputImage;
      }
      continue;
    }

    try {
      const snapshot = await executeStep(session, i, currentImage);
      currentImage = snapshot.outputImage;
      session.currentImage = currentImage;
      onStepUpdate(i, stepState);
    } catch (error: any) {
      stepState.status = 'failed';
      stepState.error = error.message || String(error);
      onStepUpdate(i, stepState);
      break; // Do not continue to next step on failure
    }
  }

  // Set final status
  const allCompleted = session.stepStates.every((ss) => ss.status === 'completed');
  if (allCompleted) {
    session.status = 'completed';
  }
}

// ─── retryStep (STACK-09) ───────────────────────────────────────

/**
 * Retries a specific step without re-running the entire stack.
 * Rolls back to the previous step's approved output, re-executes
 * the target step, and invalidates subsequent completed steps.
 */
export async function retryStep(
  session: ProductionStackSession,
  stepIndex: number,
  onStepUpdate: (stepIndex: number, state: StepState) => void,
): Promise<void> {
  // Determine input image for this step
  let previousImage: string;
  if (stepIndex === 0) {
    previousImage = session.baseImage;
  } else {
    const prevState = session.stepStates[stepIndex - 1];
    if (prevState.approvedSnapshotIndex === null) {
      throw new Error(`Cannot retry step ${stepIndex}: previous step has no approved snapshot`);
    }
    previousImage = prevState.snapshots[prevState.approvedSnapshotIndex].outputImage;
  }

  // Mark as retrying
  session.stepStates[stepIndex].status = 'retrying';
  onStepUpdate(stepIndex, session.stepStates[stepIndex]);

  // Re-execute the step
  const snapshot = await executeStep(session, stepIndex, previousImage);

  // Update session current image
  session.currentImage = snapshot.outputImage;
  onStepUpdate(stepIndex, session.stepStates[stepIndex]);

  // Invalidate subsequent completed steps (they are now stale)
  for (let i = stepIndex + 1; i < session.stepStates.length; i++) {
    if (session.stepStates[i].status === 'completed') {
      session.stepStates[i].status = 'pending';
      session.stepStates[i].approvedSnapshotIndex = null;
    }
  }
}

// ─── initFollowUpSession (STACK-10) ────────────────────────────

/**
 * Creates a chat session for post-completion follow-up edits.
 * Must be called after stack execution completes.
 */
export function initFollowUpSession(session: ProductionStackSession): void {
  if (!session.currentImage) {
    throw new Error('No completed image for follow-up');
  }

  session.chatSession = createImageChatSession({
    aspectRatio: session.aspectRatio,
    imageSize: session.imageSize,
  });

  session.status = 'follow-up';
}

// ─── sendFollowUpEdit (STACK-10, STACK-11) ─────────────────────

/**
 * Sends a conversational follow-up edit. Includes preservation instruction
 * to keep all existing jewelry stable (STACK-11).
 */
export async function sendFollowUpEdit(
  session: ProductionStackSession,
  userPrompt: string,
): Promise<string> {
  if (!session.chatSession || !session.currentImage) {
    throw new Error('Follow-up session not initialized');
  }

  const preserveInstruction =
    'You are editing a production jewelry photo. ALL existing jewelry on the model must be PRESERVED exactly as-is unless explicitly told otherwise. Do NOT remove, shift, resize, or alter any previously placed jewelry.';

  const userParts: any[] = [
    { text: `${preserveInstruction}\n\nINSTRUCTION: ${userPrompt}` },
  ];

  // On first turn, include the current image as context
  if (session.chatSession.history.length === 0) {
    const imageData = extractBase64(session.currentImage);
    userParts.push({
      inlineData: { mimeType: 'image/png', data: imageData },
    });
  }

  const result = await continueImageChatSession(session.chatSession, userParts);

  if (result.images.length > 0) {
    const newImage = result.images[0].dataUri;

    // Record follow-up snapshot
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

  throw new Error('No image returned from follow-up edit');
}

// ─── compactSnapshots (Pitfall 3 — memory management) ───────────

/**
 * Manages memory by clearing non-approved snapshot images.
 * Keeps only the approved attempt's full images, freeing memory
 * from failed/rejected attempts.
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
