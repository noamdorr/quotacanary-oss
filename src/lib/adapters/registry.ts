import { ahrefsAdapter } from "./ahrefs"
import { apifyAdapter } from "./apify"
import { apolloAdapter } from "./apollo"
import { brevoAdapter } from "./brevo"
import { catalogAdapters } from "./catalog"
import { contactoutAdapter } from "./contactout"
import { crawlbaseAdapter } from "./crawlbase"
import { dataforseoAdapter } from "./dataforseo"
import { decodoAdapter } from "./decodo"
import { deepgramAdapter } from "./deepgram"
import { deepseekAdapter } from "./deepseek"
import { diffbotAdapter } from "./diffbot"
import { E2E_MOCK_TOOL_ID, e2eMockAdapter } from "./e2e-mock"
import { enrichcrmAdapter } from "./enrichcrm"
import { firecrawlAdapter } from "./firecrawl"
import { hlrlookupAdapter } from "./hlrlookup"
import { hyperbolicAdapter } from "./hyperbolic"
import { icypeasAdapter } from "./icypeas"
import { lemlistAdapter } from "./lemlist"
import { majesticAdapter } from "./majestic"
import { mangoolsAdapter } from "./mangools"
import { meltlyAdapter } from "./meltly"
import { netnutAdapter } from "./netnut"
import { openrouterAdapter } from "./openrouter"
import { orthogonalAdapter } from "./orthogonal"
import { peopledatalabsAdapter } from "./peopledatalabs"
import { phantombusterAdapter } from "./phantombuster"
import { plivoAdapter } from "./plivo"
import { predictleadsAdapter } from "./predictleads"
import { rocketreachAdapter } from "./rocketreach"
import { semrushAdapter } from "./semrush"
import { snovAdapter } from "./snov"
import { tavilyAdapter } from "./tavily"
import { thecompaniesapiAdapter } from "./thecompaniesapi"
import { tombaAdapter } from "./tomba"
import { twilioAdapter } from "./twilio"
import type { ToolAdapter } from "./types"
import { verifaliaAdapter } from "./verifalia"
import { vonageAdapter } from "./vonage"
import { webshareAdapter } from "./webshare"
import { youcomAdapter } from "./youcom"
import { zerobounceAdapter } from "./zerobounce"

// Adapters the declarative catalog cannot express; everything else lives in
// catalog/tools.json (see wiki/raw/2026-10-11-adapter-catalog-inventory.md).
const HAND_WRITTEN: Record<string, ToolAdapter> = {
  [openrouterAdapter.toolId]: openrouterAdapter,
  [zerobounceAdapter.toolId]: zerobounceAdapter,
  [deepseekAdapter.toolId]: deepseekAdapter,
  [hyperbolicAdapter.toolId]: hyperbolicAdapter,
  [apolloAdapter.toolId]: apolloAdapter,
  [dataforseoAdapter.toolId]: dataforseoAdapter,
  [firecrawlAdapter.toolId]: firecrawlAdapter,
  [rocketreachAdapter.toolId]: rocketreachAdapter,
  [netnutAdapter.toolId]: netnutAdapter,
  [orthogonalAdapter.toolId]: orthogonalAdapter,
  [tombaAdapter.toolId]: tombaAdapter,
  [snovAdapter.toolId]: snovAdapter,
  [contactoutAdapter.toolId]: contactoutAdapter,
  [crawlbaseAdapter.toolId]: crawlbaseAdapter,
  [predictleadsAdapter.toolId]: predictleadsAdapter,
  [diffbotAdapter.toolId]: diffbotAdapter,
  [majesticAdapter.toolId]: majesticAdapter,
  [ahrefsAdapter.toolId]: ahrefsAdapter,
  [verifaliaAdapter.toolId]: verifaliaAdapter,
  [tavilyAdapter.toolId]: tavilyAdapter,
  [enrichcrmAdapter.toolId]: enrichcrmAdapter,
  [semrushAdapter.toolId]: semrushAdapter,
  [meltlyAdapter.toolId]: meltlyAdapter,
  [mangoolsAdapter.toolId]: mangoolsAdapter,
  [lemlistAdapter.toolId]: lemlistAdapter,
  [twilioAdapter.toolId]: twilioAdapter,
  [plivoAdapter.toolId]: plivoAdapter,
  [vonageAdapter.toolId]: vonageAdapter,
  [peopledatalabsAdapter.toolId]: peopledatalabsAdapter,
  [phantombusterAdapter.toolId]: phantombusterAdapter,
  [deepgramAdapter.toolId]: deepgramAdapter,
  [webshareAdapter.toolId]: webshareAdapter,
  [decodoAdapter.toolId]: decodoAdapter,
  [brevoAdapter.toolId]: brevoAdapter,
  [apifyAdapter.toolId]: apifyAdapter,
  [hlrlookupAdapter.toolId]: hlrlookupAdapter,
  [icypeasAdapter.toolId]: icypeasAdapter,
  [thecompaniesapiAdapter.toolId]: thecompaniesapiAdapter,
  [youcomAdapter.toolId]: youcomAdapter,
}

export const HAND_WRITTEN_TOOL_IDS = Object.keys(HAND_WRITTEN)

export function getAdapter(toolId: string): ToolAdapter | undefined {
  // The browser smoke suite's vendor-free adapter, kept out of the table above so
  // it can never be reached without the flag. Inert when E2E_MOCK_TOOL is unset,
  // which is every environment except a local or CI e2e run.
  if (toolId === E2E_MOCK_TOOL_ID) {
    return process.env.E2E_MOCK_TOOL === "true" ? e2eMockAdapter : undefined
  }
  return HAND_WRITTEN[toolId] ?? catalogAdapters()[toolId]
}
