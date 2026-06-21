import { ahrefsAdapter } from "./ahrefs"
import { anymailfinderAdapter } from "./anymailfinder"
import { apifyAdapter } from "./apify"
import { bettercontactAdapter } from "./bettercontact"
import { bouncerAdapter } from "./bouncer"
import { bouncifyAdapter } from "./bouncify"
import { brightdataAdapter } from "./brightdata"
import { captaindataAdapter } from "./captaindata"
import { clearoutAdapter } from "./clearout"
import { contactoutAdapter } from "./contactout"
import { dataforseoAdapter } from "./dataforseo"
import { debounceAdapter } from "./debounce"
import { deepseekAdapter } from "./deepseek"
import { dropcontactAdapter } from "./dropcontact"
import { emailableAdapter } from "./emailable"
import { emailhippoAdapter } from "./emailhippo"
import { emaillistverifyAdapter } from "./emaillistverify"
import { enrichcrmAdapter } from "./enrichcrm"
import { enrowAdapter } from "./enrow"
import { findymailAdapter } from "./findymail"
import { firecrawlAdapter } from "./firecrawl"
import { fullenrichAdapter } from "./fullenrich"
import { hunterAdapter } from "./hunter"
import { hyperbolicAdapter } from "./hyperbolic"
import { leadmagicAdapter } from "./leadmagic"
import { lushaAdapter } from "./lusha"
import { mailercheckAdapter } from "./mailercheck"
import { meltlyAdapter } from "./meltly"
import { millionverifierAdapter } from "./millionverifier"
import { myemailverifierAdapter } from "./myemailverifier"
import { netnutAdapter } from "./netnut"
import { neverbounceAdapter } from "./neverbounce"
import { openrouterAdapter } from "./openrouter"
import { opporaAdapter } from "./oppora"
import { orthogonalAdapter } from "./orthogonal"
import { outscraperAdapter } from "./outscraper"
import { prospeoAdapter } from "./prospeo"
import { proxycurlAdapter } from "./proxycurl"
import { reoonAdapter } from "./reoon"
import { rocketreachAdapter } from "./rocketreach"
import { scrapegraphaiAdapter } from "./scrapegraphai"
import { scrapeopsAdapter } from "./scrapeops"
import { scraperapiAdapter } from "./scraperapi"
import { scrapflyAdapter } from "./scrapfly"
import { scrapingantAdapter } from "./scrapingant"
import { scrapingbeeAdapter } from "./scrapingbee"
import { scrapingdogAdapter } from "./scrapingdog"
import { searchapiAdapter } from "./searchapi"
import { semrushAdapter } from "./semrush"
import { serpapiAdapter } from "./serpapi"
import { serpwowAdapter } from "./serpwow"
import { shodanAdapter } from "./shodan"
import { skrappAdapter } from "./skrapp"
import { snovAdapter } from "./snov"
import { surfeAdapter } from "./surfe"
import { tavilyAdapter } from "./tavily"
import { tombaAdapter } from "./tomba"
import type { ToolAdapter } from "./types"
import { valueserpAdapter } from "./valueserp"
import { verifaliaAdapter } from "./verifalia"
import { wizaAdapter } from "./wiza"
import { zenserpAdapter } from "./zenserp"
import { zerobounceAdapter } from "./zerobounce"

const ADAPTERS: Record<string, ToolAdapter> = {
  [neverbounceAdapter.toolId]: neverbounceAdapter,
  [millionverifierAdapter.toolId]: millionverifierAdapter,
  [openrouterAdapter.toolId]: openrouterAdapter,
  [opporaAdapter.toolId]: opporaAdapter,
  [zerobounceAdapter.toolId]: zerobounceAdapter,
  [bouncerAdapter.toolId]: bouncerAdapter,
  [emailableAdapter.toolId]: emailableAdapter,
  [serpapiAdapter.toolId]: serpapiAdapter,
  [hunterAdapter.toolId]: hunterAdapter,
  [leadmagicAdapter.toolId]: leadmagicAdapter,
  [prospeoAdapter.toolId]: prospeoAdapter,
  [findymailAdapter.toolId]: findymailAdapter,
  [fullenrichAdapter.toolId]: fullenrichAdapter,
  [deepseekAdapter.toolId]: deepseekAdapter,
  [hyperbolicAdapter.toolId]: hyperbolicAdapter,
  [scrapingbeeAdapter.toolId]: scrapingbeeAdapter,
  [scraperapiAdapter.toolId]: scraperapiAdapter,
  [scrapingdogAdapter.toolId]: scrapingdogAdapter,
  [brightdataAdapter.toolId]: brightdataAdapter,
  [apifyAdapter.toolId]: apifyAdapter,
  [emaillistverifyAdapter.toolId]: emaillistverifyAdapter,
  [clearoutAdapter.toolId]: clearoutAdapter,
  [dataforseoAdapter.toolId]: dataforseoAdapter,
  [firecrawlAdapter.toolId]: firecrawlAdapter,
  [reoonAdapter.toolId]: reoonAdapter,
  [myemailverifierAdapter.toolId]: myemailverifierAdapter,
  [debounceAdapter.toolId]: debounceAdapter,
  [bouncifyAdapter.toolId]: bouncifyAdapter,
  [rocketreachAdapter.toolId]: rocketreachAdapter,
  [anymailfinderAdapter.toolId]: anymailfinderAdapter,
  [wizaAdapter.toolId]: wizaAdapter,
  [surfeAdapter.toolId]: surfeAdapter,
  [lushaAdapter.toolId]: lushaAdapter,
  [enrowAdapter.toolId]: enrowAdapter,
  [dropcontactAdapter.toolId]: dropcontactAdapter,
  [valueserpAdapter.toolId]: valueserpAdapter,
  [serpwowAdapter.toolId]: serpwowAdapter,
  [searchapiAdapter.toolId]: searchapiAdapter,
  [zenserpAdapter.toolId]: zenserpAdapter,
  [scrapingantAdapter.toolId]: scrapingantAdapter,
  [scrapflyAdapter.toolId]: scrapflyAdapter,
  [captaindataAdapter.toolId]: captaindataAdapter,
  [scrapeopsAdapter.toolId]: scrapeopsAdapter,
  [netnutAdapter.toolId]: netnutAdapter,
  [scrapegraphaiAdapter.toolId]: scrapegraphaiAdapter,
  [mailercheckAdapter.toolId]: mailercheckAdapter,
  [emailhippoAdapter.toolId]: emailhippoAdapter,
  [outscraperAdapter.toolId]: outscraperAdapter,
  [orthogonalAdapter.toolId]: orthogonalAdapter,
  [tombaAdapter.toolId]: tombaAdapter,
  [snovAdapter.toolId]: snovAdapter,
  [contactoutAdapter.toolId]: contactoutAdapter,
  [proxycurlAdapter.toolId]: proxycurlAdapter,
  [ahrefsAdapter.toolId]: ahrefsAdapter,
  [bettercontactAdapter.toolId]: bettercontactAdapter,
  [shodanAdapter.toolId]: shodanAdapter,
  [verifaliaAdapter.toolId]: verifaliaAdapter,
  [tavilyAdapter.toolId]: tavilyAdapter,
  [enrichcrmAdapter.toolId]: enrichcrmAdapter,
  [semrushAdapter.toolId]: semrushAdapter,
  [meltlyAdapter.toolId]: meltlyAdapter,
  [skrappAdapter.toolId]: skrappAdapter,
}

export function getAdapter(toolId: string): ToolAdapter | undefined {
  return ADAPTERS[toolId]
}
