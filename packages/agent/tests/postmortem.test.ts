import { describe, it, expect, vi } from 'vitest';
import { SibylPostmortemAnalyzer } from '../src/postmortem';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: class MockAnthropic {
      messages = {
        create: vi.fn().mockImplementation(async (args: any) => {
          return {
            content: [{ 
              text: `### Explanation
This prevents the database timeout from taking down the API.
### Promise
\`\`\`typescript
export const promises: ProgrammaticPromise[] = [
  { id: 'db-resilience', evaluate: () => true }
];
\`\`\`
### Template
\`\`\`typescript
export const templates: FaultScheduleTemplate[] = [
  { id: 'db-timeout', spec: { domain: 'DB', type: 'TIMEOUT' } }
];
\`\`\`` 
            }]
          };
        })
      };
    }
  };
});

describe('SibylPostmortemAnalyzer', () => {
  const analyzer = new SibylPostmortemAnalyzer({ apiKey: 'mock-key' });

  it('should parse the postmortem and return drafted artifacts', async () => {
    const result = await analyzer.analyze('The database timed out and caused a 500 error.');
    
    expect(result.explanation).toContain('prevents the database timeout');
    expect(result.draftPromises).toContain('db-resilience');
    expect(result.draftTemplates).toContain('db-timeout');
  });
});
