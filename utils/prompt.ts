export const makePromptHumanReadable = (value?: string | null): string | null => {
  if (typeof value !== 'string') {
    return value ?? null;
  }

  if (!/\\[nrt"\\]/.test(value)) {
    return value;
  }

  try {
    const escaped = value
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r/g, '\\r')
      .replace(/\n/g, '\\n');
    return JSON.parse(`"${escaped}"`);
  } catch {
    let formatted = value
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\n')
      .replace(/\\t/g, '  ')
      .replace(/\\\"/g, '"');

    if (formatted.includes('\\\\')) {
      formatted = formatted.replace(/\\\\/g, '\\');
    }

    return formatted;
  }
};
