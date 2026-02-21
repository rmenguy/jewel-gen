/**
 * Download a base64-encoded image as a file via browser blob download.
 */
export function downloadBase64Image(base64Data: string, filename: string): void {
  const raw = base64Data.includes('base64,') ? base64Data.split(',')[1] : base64Data;
  const mimeMatch = base64Data.match(/data:([^;]+);/);
  const mimeType = mimeMatch?.[1] || 'image/png';

  const byteCharacters = atob(raw);
  const byteArray = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteArray[i] = byteCharacters.charCodeAt(i);
  }

  const blob = new Blob([byteArray], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Download text content (JSON, CSV) as a file via browser blob download.
 */
export function downloadTextFile(content: string, filename: string): void {
  const mimeType = filename.endsWith('.csv') ? 'text/csv' :
                   filename.endsWith('.json') ? 'application/json' :
                   'text/plain';
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
