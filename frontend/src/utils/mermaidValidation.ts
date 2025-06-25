import mermaid from 'mermaid';

export interface MermaidValidationResult {
  isValid: boolean;
  error?: Error;
  normalizedCode?: string;
  warnings?: string[];
}

/**
 * Validates and normalizes Mermaid diagram code to prevent common parsing errors
 * Based on known Mermaid v11.7.0 parser bugs and issues
 */
export const validateMermaidCode = (code: string): MermaidValidationResult => {
  if (!code || !code.trim()) {
    return { isValid: true, normalizedCode: code };
  }

  // Simple normalization
  let normalizedCode = code.trim();
  normalizedCode = normalizedCode.replace(/\r\n/g, '\n');

  // Use only Mermaid's native validation
  try {
    mermaid.parse(normalizedCode);
    return {
      isValid: true,
      normalizedCode
    };
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error : new Error(String(error)),
      normalizedCode,
    };
  }
};

/**
 * Pre-processes AI-generated Mermaid code to fix common issues
 */
export const preprocessMermaidCode = (code: string): string => {
  if (!code) return code;

  let processed = code.trim();

  // Normalize line endings
  processed = processed.replace(/\r\n/g, '\n');

  // Auto-fix common reserved word issues by adding a space or changing the word
  processed = processed.replace(/\[(.*?)\bend\]/gi, '[$1 finish]');
  processed = processed.replace(/\[(.*?)\bclass\]/gi, '[$1 type]');
  processed = processed.replace(/\[(.*?)\bstyle\]/gi, '[$1 format]');

  return processed;
};