import { promises as fs } from 'node:fs';
import {
  Runner,
  InMemorySessionService,
  LlmAgent,
  isFinalResponse,
  stringifyContent,
} from '@google/adk';
import { LiteLlmAdapter } from '../adk/LiteLlmAdapter';

export type AnalysisInput = {
  imagePath: string;
  kpi: string;
};

export type AnalysisOutput = {
  providerSummaries: {
    provider: 'adk';
    model?: string;
    content: string;
  }[];
  mergedReport: string;
};

type AdkAgentLike = {
  // Keep loose typing for potential DI in tests, but default is LlmAgent
  runAsync?: (...args: any[]) => AsyncGenerator<unknown, void, unknown>;
  name?: string;
};

export class AnalysisService {
  private readonly adkAgent: AdkAgentLike;
  private readonly adkModel: string;

  constructor(deps?: { adkAgent?: AdkAgentLike }) {
    const litellmBaseUrl = process.env.LITELLM_BASE_URL;
    const litellmApiKey = process.env.LITELLM_API_KEY;
    const litellmModel = process.env.LITELLM_MODEL ?? 'gpt-4o-mini';

    // Use custom LiteLLM adapter if LiteLLM is configured
    if (litellmBaseUrl && litellmApiKey) {
      this.adkModel = litellmModel;
      
      const liteLlmInstance = new LiteLlmAdapter({
        model: litellmModel,
        baseUrl: litellmBaseUrl,
        apiKey: litellmApiKey,
      });

      this.adkAgent =
        deps?.adkAgent ??
        new LlmAgent({
          name: 'warehouse_analyst',
          description: 'Analyzes warehouse floor plans against KPI targets.',
          model: liteLlmInstance, // Pass the custom LLM instance directly
          instruction:
            'You are an expert in warehouse operations and layout optimization. Provide concise, actionable insights.',
          tools: [],
        });
    } else {
      // Fallback to Google Gemini if LiteLLM not configured
      const geminiModel = process.env.GOOGLE_MODEL ?? 'gemini-2.5-flash';
      this.adkModel = geminiModel;
      this.adkAgent =
        deps?.adkAgent ??
        new LlmAgent({
          name: 'warehouse_analyst',
          description: 'Analyzes warehouse floor plans against KPI targets.',
          model: geminiModel,
          instruction:
            'You are an expert in warehouse operations and layout optimization. Provide concise, actionable insights.',
          tools: [],
        });
    }
  }

  private async readImageBase64(imagePath: string): Promise<{ base64: string; mime: string }> {
    const buffer = await fs.readFile(imagePath);
    const mime = this.detectMime(imagePath);
    return { base64: buffer.toString('base64'), mime };
  }

  private detectMime(filePath: string): string {
    const lower = filePath.toLowerCase();
    if (lower.endsWith('.png')) return 'image/png';
    if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
    if (lower.endsWith('.webp')) return 'image/webp';
    return 'application/octet-stream';
  }

  async analyze(input: AnalysisInput): Promise<AnalysisOutput> {
    const { base64, mime } = await this.readImageBase64(input.imagePath);
    const systemPrompt =
      'You are an expert in warehouse operations and layout optimization. Provide concise, actionable insights.';
    const userPrompt = `Analyze this warehouse floor plan image and propose improvements to maximize the KPI: "${input.kpi}". Return prioritized recommendations and any layout changes.`;

    const adkContent = await this.invokeAdkAgent({
      prompt: `${systemPrompt}\n${userPrompt}\nFormat the response as plain text recommendations.`,
      imageBase64: base64,
      imageMimeType: mime,
    });

    const providerSummaries: AnalysisOutput['providerSummaries'] = [
      {
        provider: 'adk',
        model: this.adkModel,
        content: adkContent,
      },
    ];

    const mergedReport =
      providerSummaries
        .map(
          (s, idx) =>
            `Provider #${idx + 1} (${s.provider}${s.model ? `:${s.model}` : ''})\n${s.content}`,
        )
        .join('\n\n') || 'No analysis available.';

    return { providerSummaries, mergedReport };
  }

  private async invokeAdkAgent(params: {
    prompt: string;
    imageBase64: string;
    imageMimeType: string;
  }): Promise<string> {
    // // ADK JS uses Google GenAI under the hood; require GOOGLE_API_KEY or ADC
    // const googleApiKey = process.env.GOOGLE_API_KEY;
    // if (!googleApiKey) {
    //   return `[AI Analysis Unavailable - Missing GOOGLE_API_KEY]\n\nFiles received successfully:\n- Image uploaded and processed\n- KPI CSV received\n\nTo enable AI-powered warehouse analysis with Google ADK:\n1. Create server/.env based on server/env.example\n2. Set GOOGLE_API_KEY with a valid key (or configure Application Default Credentials)\n3. Optionally set GOOGLE_MODEL (defaults to ${this.adkModel})\n4. Restart the server\n\nReference: Google ADK for TypeScript (JS)`;
    // }

    // Build an in-memory runner to invoke the agent with a single user message
    const appName = 'warehouse_simulator';
    const userId = 'demo_user';
    const sessionId = 'analysis_session';
    const sessionService = new InMemorySessionService();
    await sessionService.createSession({ appName, userId, sessionId, state: {} });
    const runner = new Runner({ agent: this.adkAgent as unknown as LlmAgent, appName, sessionService });

    const newMessage = {
      role: 'user',
      parts: [
        { text: params.prompt },
        { inlineData: { data: params.imageBase64, mimeType: params.imageMimeType } },
      ],
    };

    const events: unknown[] = [];
    try {
      for await (const event of runner.runAsync({
        userId,
        sessionId,
        newMessage,
      })) {
        events.push(event);
      }
    } catch (error) {
      throw new Error(
        `Failed to invoke ADK agent: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    // Find the final response event and stringify its content
    const lastEvent = events
      .reverse()
      .find((e) => {
        try {
          return isFinalResponse(e as any);
        } catch {
          return false;
        }
      }) as any | undefined;

    if (lastEvent) {
      return stringifyContent(lastEvent);
    }

    // Fallback: stringify the last event if no explicit final response
    const fallback = events[0] as any | undefined;
    if (fallback) {
      try {
        return stringifyContent(fallback);
      } catch {
        // noop
      }
    }
    return '';
  }
}


