import { Injectable, Logger } from '@nestjs/common';
import { LlmService } from '../../llm/llm.service.js';
import { LLMChatMessage } from '../../llm/llm.types.js';
import {
  RequirementParseResult,
  TransportationPreference,
  TravelPace,
  TravelRequirement,
} from '../types/travel-requirement.js';

const TRAVEL_PACES: TravelPace[] = ['relaxed', 'balanced', 'intensive'];
const TRANSPORT_MODES: TransportationPreference[] = ['public', 'walking', 'taxi', 'car', 'mixed'];

// Requirement Parser：Structured Output（JSON 约束）把自然语言 → TravelRequirement。
// 需求不完整时返回澄清问题，交由 Orchestrator 触发 needs_input 流程。
@Injectable()
export class RequirementParser {
  private readonly logger = new Logger(RequirementParser.name);

  constructor(private readonly llm: LlmService) {}

  async parse(
    messages: LLMChatMessage[],
    onDelta?: (text: string) => void,
  ): Promise<RequirementParseResult> {
    const system = this.buildSystemPrompt();
    const history = messages.slice(-10); // 控制上下文长度
    const raw = await this.llm.chatJsonStream<RequirementParseResult>(
      [{ role: 'system', content: system }, ...history],
      {},
      onDelta,
    );
    return this.normalize(raw);
  }

  private buildSystemPrompt(): string {
    const today = new Date().toISOString().slice(0, 10);
    return [
      '你是 TripAgent 的旅行需求解析器，负责把用户的自然语言旅行需求解析为结构化 JSON。',
      `今天是 ${today}。当用户给出相对日期（如"下周"、"五一"）时，结合今天推断具体日期。`,
      '你【只能】输出一个 JSON 对象，禁止输出任何其他文字、注释或 markdown。JSON 结构：',
      JSON.stringify(
        {
          requirement: {
            destination: '目的地城市/区域（未提到为 null）',
            startDate: '出发日期 YYYY-MM-DD（无法推断为 null）',
            endDate: '返回日期 YYYY-MM-DD（无法推断为 null）',
            days: '旅行天数（数字，用户说"5天"则填 5；无法推断为 null）',
            travelers: '出行人数（数字，未提到为 null）',
            budget: '预算（数字，人民币元，未提到为 null）',
            currency: '"CNY"',
            preferences: ['喜欢的东西，如 美食/动漫/拍照/购物/自然风光'],
            avoidPreferences: ['排斥或不喜欢的东西'],
            travelPace: '"relaxed"(轻松)|"balanced"(适中)|"intensive"(紧凑)，未提到为 null',
            transportationPreference:
              '"public"(公共交通)|"walking"(步行)|"taxi"(打车)|"car"(自驾)|"mixed"(混合)，未提到为 null',
          },
          isComplete:
            'true/false。当目的地明确，且（日期或天数至少一项明确）时为 true，否则 false',
          missingFields: ['缺失的关键字段名，如 destination/startDate/endDate/days'],
          clarifyingQuestions: [
            '针对缺失信息向用户提出的中文澄清问题（1-3 个；完整则空数组）',
          ],
        },
        null,
        2,
      ),
      '规则：',
      '- 关键字段：destination，以及 startDate/endDate/days 至少其一。缺失任一关键信息则 isComplete=false，并在 clarifyingQuestions 中提问。',
      '- budget/travelers/travelPace/preferences 等缺失不影响完整性，但尽量推断（如"一家三口"→ travelers=3）。',
      '- preferences/avoidPreferences 未提到用空数组。',
    ].join('\n');
  }

  private normalize(raw: RequirementParseResult): RequirementParseResult {
    const r = raw ?? ({} as RequirementParseResult);
    // 兼容两种输出结构：requirement 嵌套（标准）或顶层平铺（LLM/Mock 可能漂移）
    const src = (r.requirement ?? r) as TravelRequirement;
    const req: TravelRequirement = {
      destination: this.str(src.destination),
      startDate: this.dateOrNull(src.startDate),
      endDate: this.dateOrNull(src.endDate),
      days: this.numOrNull(src.days),
      travelers: this.numOrNull(src.travelers),
      budget: this.numOrNull(src.budget),
      currency: this.str(src.currency) || 'CNY',
      preferences: this.strArray(src.preferences),
      avoidPreferences: this.strArray(src.avoidPreferences),
      travelPace: this.enumOrNull(src.travelPace, TRAVEL_PACES),
      transportationPreference: this.enumOrNull(
        src.transportationPreference,
        TRANSPORT_MODES,
      ),
    };

    // 依据规范化后的字段重新判定完整性（防止 LLM 误判）
    const hasDate = Boolean(req.startDate && req.endDate) || Boolean(req.days);
    const isComplete = Boolean(req.destination) && hasDate;

    const missing: string[] = [];
    if (!req.destination) missing.push('destination');
    if (!req.days) {
      if (!req.startDate) missing.push('startDate');
      if (!req.endDate) missing.push('endDate');
    }

    const result: RequirementParseResult = {
      requirement: isComplete ? req : null,
      isComplete,
      missingFields: missing,
      clarifyingQuestions: isComplete
        ? []
        : this.strArray(r.clarifyingQuestions).length
          ? this.strArray(r.clarifyingQuestions)
          : ['请问您计划去哪里旅行？', '计划出行几天、大概什么时候出发？'],
    };

    this.logger.log(`Parsed requirement: complete=${result.isComplete} dest=${req.destination}`);
    return result;
  }

  private str(v: unknown): string {
    return typeof v === 'string' ? v.trim() : '';
  }

  private strArray(v: unknown): string[] {
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  }

  private numOrNull(v: unknown): number | null {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string' && v.trim() !== '') {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  private dateOrNull(v: unknown): string | null {
    if (typeof v !== 'string') return null;
    const m = /^\d{4}-\d{2}-\d{2}$/.exec(v.trim());
    return m ? v.trim() : null;
  }

  private enumOrNull<T extends string>(v: unknown, allowed: T[]): T | null {
    return typeof v === 'string' && allowed.includes(v as T) ? (v as T) : null;
  }
}
