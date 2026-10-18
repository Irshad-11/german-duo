/** Root folder of the shared Google Drive library. Override with VITE_DRIVE_ROOT_URL. */
export const DRIVE_ROOT_URL: string = (import.meta.env.VITE_DRIVE_ROOT_URL ?? '').trim() || 'https://drive.google.com/drive/folders/1FC3aFLlm1TaABG1qnPCXOyHtlsyHg8Qw?usp=sharing';
/** Drive cannot deep-link to a file inside a folder by name, so we offer a name search as the next best thing. */
export const driveSearchUrl = (name: string): string => `https://drive.google.com/drive/search?q=${encodeURIComponent(name)}`;
