
const { salesTool, productTool, customerDuesTool, emiTool } = require("./agentTools");
const debug = (msg, ...args) => { if (process.env.NODE_ENV !== "production") console.debug("[AI AGENT]", msg, ...args); };

let langchainAgentAvailable = false;
let agentExecutor = null;

async function tryInitLangchainAgent() {
  try {
    // dynamic imports to avoid failing startup if packages missing
    const { ChatGoogleGenerativeAI } = require("@langchain/google-genai");
    const { createToolCallingAgent, AgentExecutor } = require("@langchain/agents");
    const { ChatPromptTemplate } = require("@langchain/core/prompts");
    const { DynamicStructuredTool } = require("@langchain/core/tools");
    const { z } = require("zod");

    if (!process.env.GOOGLE_API_KEY) {
      throw new Error("GOOGLE_API_KEY missing");
    }

    // Create langchain tools that call our local functions
    const tools = [
      new DynamicStructuredTool({
        name: "sales_tool",
        description: "Fetch sales summary",
        schema: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          paymentStatus: z.string().optional(),
        }),
        func: async (args) => {
          const meta = args.__metadata || {};
          return JSON.stringify(await salesTool({ ...args, organizationId: meta.organizationId, branchId: meta.branchId }));
        },
      }),
      new DynamicStructuredTool({
        name: "product_tool",
        description: "Check product inventory",
        schema: z.object({ productName: z.string() }),
        func: async (args) => {
          const meta = args.__metadata || {};
          return JSON.stringify(await productTool({ ...args, organizationId: meta.organizationId, branchId: meta.branchId }));
        },
      }),
      new DynamicStructuredTool({
        name: "customer_dues",
        description: "Fetch customers with dues",
        schema: z.object({ minAmount: z.number().optional() }),
        func: async (args) => {
          const meta = args.__metadata || {};
          return JSON.stringify(await customerDuesTool({ ...args, organizationId: meta.organizationId }));
        },
      }),
      new DynamicStructuredTool({
        name: "emi_tool",
        description: "Check EMIs",
        schema: z.object({ status: z.string().optional() }),
        func: async (args) => {
          const meta = args.__metadata || {};
          return JSON.stringify(await emiTool({ ...args, organizationId: meta.organizationId }));
        },
      }),
    ];

    const llm = new ChatGoogleGenerativeAI({
      modelName: "gemini-1.5-flash",
      apiKey: process.env.GOOGLE_API_KEY,
      temperature: 0,
    });

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", "You are an expert CRM assistant. Use tools when data required. If tools return JSON, summarise them."],
      ["human", "{input}"],
      ["placeholder", "{agent_scratchpad}"],
    ]);

    const agent = await createToolCallingAgent({ llm, tools, prompt });
    agentExecutor = new AgentExecutor({ agent, tools });
    langchainAgentAvailable = true;
    debug("LangChain agent initialized");
  } catch (err) {
    langchainAgentAvailable = false;
    debug("LangChain init failed:", err.message || err);
  }
}

// non-blocking init
tryInitLangchainAgent();

// Simple fallback router: parse intent with regex and call tool functions directly
async function fallbackProcess(message, userContext) {
  const text = (message || "").toLowerCase();

  // heuristics
  if (/sales|revenue|turnover/.test(text)) {
    // try to extract dates using ISO-like tokens yyyy-mm-dd or words like 'last month'
    const dateRange = extractDateRangeFromText(text);
    const result = await salesTool({ organizationId: userContext.organizationId, branchId: userContext.branchId, ...dateRange });
    return summarizeToolResult("Sales", result);
  }

  if (/product|stock|inventory/.test(text)) {
    const m = text.match(/product(?: named| )?\s*([a-z0-9\-\s]+)/i);
    const name = (m && m[1]) ? m[1].trim() : "";
    const result = await productTool({ productName: name || "", organizationId: userContext.organizationId, branchId: userContext.branchId });
    return summarizeToolResult("Product", result);
  }

  if (/dues|outstanding|owing|owing customers|customers with.*due/.test(text)) {
    const m = text.match(/(?:min|greater than|> )\s*([0-9]+)/);
    const minAmount = m ? Number(m[1]) : 0;
    const result = await customerDuesTool({ minAmount, organizationId: userContext.organizationId });
    return summarizeToolResult("Customer Dues", result);
  }

  if (/emi|installment|installments|pending emi/.test(text)) {
    const status = /overdue/.test(text) ? "overdue" : undefined;
    const result = await emiTool({ status, organizationId: userContext.organizationId });
    return summarizeToolResult("EMIs", result);
  }

  // default: short helpful reply
  return "I can fetch sales, products, customer dues and EMIs. Try: 'sales last 30 days', 'product iPhone', 'customers owing > 1000'.";
}

function extractDateRangeFromText(text) {
  // Attempt simple extraction: yyyy-mm-dd to yyyy-mm-dd or words "last month", "today"
  const isoMatches = text.match(/(\d{4}-\d{2}-\d{2})/g);
  if (isoMatches && isoMatches.length >= 2) {
    return { startDate: isoMatches[0], endDate: isoMatches[1] };
  }
  if (/\blast month\b/.test(text)) {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (/\btoday\b/.test(text)) {
    const today = new Date();
    const start = new Date(today.setHours(0, 0, 0, 0));
    const end = new Date(today.setHours(23, 59, 59, 999));
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  return {};
}

function summarizeToolResult(label, toolResult) {
  if (!toolResult) return `${label}: no data`;
  if (toolResult.error) return `${label} error: ${toolResult.error}`;

  const summaryParts = [];
  if (toolResult.meta) {
    if (toolResult.meta.count !== undefined) summaryParts.push(`count=${toolResult.meta.count}`);
    if (toolResult.meta.totalRevenue !== undefined) summaryParts.push(`totalRevenue=${toolResult.meta.totalRevenue}`);
  }
  const rows = toolResult.rows || toolResult.rows || toolResult.rows || [];
  const sample = rows.slice(0, 5);
  return `${label} — ${summaryParts.join(", ") || "results available"}.\nSample:\n${JSON.stringify(sample, null, 2)}`;
}

async function processUserMessage(message, userContext = {}) {
  // userContext must include organizationId
  const orgOk = userContext && userContext.organizationId;
  if (!orgOk) return "organizationId required";

  if (langchainAgentAvailable && agentExecutor) {
    try {
      const invokeRes = await agentExecutor.invoke(
        { input: message, currentDate: new Date().toISOString() },
        { metadata: { organizationId: userContext.organizationId, branchId: userContext.branchId } }
      );
      // AgentExecutor output shape varies; safe stringify
      return (invokeRes && (invokeRes.output || invokeRes.result || JSON.stringify(invokeRes))) || "No reply";
    } catch (err) {
      console.error("LangChain agent runtime error:", err);
      // fall through to fallback
    }
  }

  // fallback
  return fallbackProcess(message, userContext);
}

module.exports = { processUserMessage, tryInitLangchainAgent };
