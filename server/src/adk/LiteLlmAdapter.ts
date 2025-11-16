import { BaseLlm } from '@google/adk';
import type { LlmRequest, LlmResponse } from '@google/adk';

/**
 * Custom BaseLlm adapter that routes requests to a LiteLLM proxy gateway.
 * This allows using OpenAI models (or any LiteLLM-supported model) with ADK JS.
 */
export class LiteLlmAdapter extends BaseLlm {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  static readonly supportedModels = [/.*/]; // Accept any model name

  constructor({ model, baseUrl, apiKey }: { model: string; baseUrl: string; apiKey: string }) {
    super({ model });
    this.baseUrl = baseUrl;
    this.apiKey = apiKey;
  }

  async *generateContentAsync(llmRequest: LlmRequest, stream = false): AsyncGenerator<LlmResponse, void> {
    // Convert ADK LlmRequest to OpenAI-compatible format
    const messages = llmRequest.contents.map((content) => {
      const parts = content.parts || [];
      
      // Check if we have mixed text + images
      const textParts = parts.filter((p) => 'text' in p && p.text);
      const imageParts = parts.filter((p) => 'inlineData' in p && p.inlineData);
      
      if (imageParts.length > 0) {
        // Vision format: content is an array of objects
        const contentArray: any[] = [];
        
        // Add text parts
        textParts.forEach((p) => {
          if ('text' in p && p.text) {
            contentArray.push({
              type: 'text',
              text: p.text,
            });
          }
        });
        
        // Add image parts
        imageParts.forEach((p) => {
          if ('inlineData' in p && p.inlineData) {
            contentArray.push({
              type: 'image_url',
              image_url: {
                url: `data:${p.inlineData.mimeType};base64,${p.inlineData.data}`,
              },
            });
          }
        });
        
        return {
          role: content.role === 'model' ? 'assistant' : content.role,
          content: contentArray,
        };
      } else {
        // Text-only format: content is a string
        const textContent = textParts.map((p) => ('text' in p ? p.text : '')).join('\n');
        return {
          role: content.role === 'model' ? 'assistant' : content.role,
          content: textContent,
        };
      }
    });

    // Build OpenAI-compatible request
    const requestBody: Record<string, unknown> = {
      model: this.model,
      messages,
      stream,
    };

    // Add temperature/other config
    if (llmRequest.config?.temperature !== undefined) {
      requestBody.temperature = llmRequest.config.temperature;
    }
    if (llmRequest.config?.maxOutputTokens !== undefined) {
      requestBody.max_tokens = llmRequest.config.maxOutputTokens;
    }

    // Log request but truncate base64 images for readability
    const logBody = JSON.parse(JSON.stringify(requestBody));
    if (logBody.messages) {
      logBody.messages = logBody.messages.map((msg: any) => {
        if (Array.isArray(msg.content)) {
          return {
            ...msg,
            content: msg.content.map((part: any) => {
              if (part.type === 'image_url' && part.image_url?.url) {
                return {
                  ...part,
                  image_url: {
                    url: part.image_url.url.substring(0, 50) + '...[truncated]'
                  }
                };
              }
              return part;
            })
          };
        }
        return msg;
      });
    }
    console.log('LiteLLM Request:', JSON.stringify(logBody, null, 2));

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`LiteLLM request failed: ${response.status}`, errorText);
        
        // Return a helpful error message instead of throwing
        yield {
          content: {
            role: 'model',
            parts: [{
              text: `[LiteLLM Error ${response.status}]\n\nThe LiteLLM proxy service returned an error:\n${errorText}\n\nPossible causes:\n- LiteLLM service is not running or scaled to zero\n- OpenAI API key not configured in LiteLLM\n- Network connectivity issues\n\nPlease check your LiteLLM deployment on GCP Cloud Run.`
            }]
          },
          errorCode: `LITELLM_${response.status}`,
          errorMessage: errorText,
        } as LlmResponse;
        return;
      }

      if (stream) {
        // Handle streaming response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        if (!reader) throw new Error('No response body');

        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const delta = parsed.choices?.[0]?.delta;
                if (delta?.content) {
                  yield this.convertToLlmResponse({ content: delta.content }, true);
                }
                if (delta?.tool_calls) {
                  yield this.convertToLlmResponse({ tool_calls: delta.tool_calls }, false);
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      } else {
        // Handle non-streaming response
        const data = await response.json();
        console.log('LiteLLM response:', JSON.stringify(data, null, 2));
        yield this.convertToLlmResponse(data, false);
      }
    } catch (error) {
      console.error('LiteLLM error:', error);
      yield {
        errorCode: 'LITELLM_ERROR',
        errorMessage: error instanceof Error ? error.message : String(error),
      } as LlmResponse;
    }
  }

  private convertToLlmResponse(data: any, partial: boolean): LlmResponse {
    console.log('Converting LiteLLM response, data:', JSON.stringify(data, null, 2));
    
    const choice = data.choices?.[0];
    const message = choice?.message || choice?.delta || {};

    const parts: any[] = [];

    // Add text content
    if (message.content || data.content) {
      const textContent = message.content || data.content;
      console.log('Found text content:', textContent);
      parts.push({ text: textContent });
    }

    // Add function calls (tool calls)
    if (message.tool_calls) {
      for (const toolCall of message.tool_calls) {
        parts.push({
          functionCall: {
            name: toolCall.function.name,
            args: JSON.parse(toolCall.function.arguments || '{}'),
          },
        });
      }
    }

    console.log('Converted parts:', parts);

    const llmResponse = {
      content: parts.length > 0 ? { role: 'model', parts } : undefined,
      partial,
      turnComplete: !partial && choice?.finish_reason !== null,
      finishReason: choice?.finish_reason,
    } as LlmResponse;

    console.log('Final LlmResponse:', JSON.stringify(llmResponse, null, 2));
    return llmResponse;
  }

  async connect(): Promise<never> {
    throw new Error('LiteLlmAdapter does not support live/bidi-streaming connections.');
  }
}

