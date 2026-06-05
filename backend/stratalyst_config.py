"""
STRATAGENT — STRATALYST Configuration
======================================
This file defines everything STRATALYST searches for and how it values what it finds.
Update this file during improvement sprints — no changes to agent code required.

SECTIONS:
  1. SOURCE TYPES         — what types of web sources exist and their estimated depth gain
  2. GAP SEARCH DIRECTIVES — per-element search instructions passed to Gemini
  3. ELEMENT LABELS        — display names for KB intelligence elements
  4. SEARCH PRIORITIES     — which source types to prefer per gap element
"""

# ── 1. SOURCE TYPES ──────────────────────────────────────────────────────────
# Each entry defines a source type STRATALYST can find.
# estimated_gain: approximate Intelligence Depth points this source type typically adds
# description: what this source type usually contains

SOURCE_TYPES = {
    "company_website": {
        "estimated_gain": 10,
        "description": "Official company website — product pages, about, contact",
    },
    "linkedin": {
        "estimated_gain": 8,
        "description": "LinkedIn company page — overview, headcount, recent posts, follower signals",
    },
    "datasheet": {
        "estimated_gain": 12,
        "description": "Product datasheet or technical spec sheet — performance data, materials, ratings",
    },
    "case_study": {
        "estimated_gain": 14,
        "description": "Case study, application note, or project reference — named installations, outcomes",
    },
    "certification_register": {
        "estimated_gain": 10,
        "description": "Official certification body register — ATEX, CE, ISO, DNV, UL, FDA, GOST entries",
    },
    "trade_directory": {
        "estimated_gain": 7,
        "description": "Trade directory listing — Kompass, DUNS, Europages, Wer liefert was, Thomas Net",
    },
    "trade_press": {
        "estimated_gain": 6,
        "description": "Industry magazine or trade press article mentioning the company or its products",
    },
    "news_article": {
        "estimated_gain": 5,
        "description": "News article — company announcements, product launches, partnerships, expansions",
    },
    "regulatory": {
        "estimated_gain": 9,
        "description": "Regulatory filing, compliance document, or government register entry",
    },
    "distributor_page": {
        "estimated_gain": 6,
        "description": "Distributor or reseller product listing — often contains specs and application info",
    },
    "retailer_webshop": {
        "estimated_gain": 14,
        "description": "Consumer or B2B webshop selling the product — reveals retail price point, private label branding, volume tier pricing, channel markup, and which buyer segments access the product commercially. Highest value source for pricing_framework and distribution_channels.",
    },
    "patent_database": {
        "estimated_gain": 8,
        "description": "Patent filing — reveals technical innovation, materials, process specifics",
    },
    "trade_show": {
        "estimated_gain": 5,
        "description": "Trade show exhibitor listing or press release — confirms market presence and product focus",
    },
    "video_content": {
        "estimated_gain": 6,
        "description": "YouTube, Vimeo, or embedded video — product demos, installation walkthroughs, testimonials",
    },
    "industry_association": {
        "estimated_gain": 6,
        "description": "Industry association membership page — confirms sector focus and peer group",
    },
    "annual_report": {
        "estimated_gain": 9,
        "description": "Annual report or investor document — revenue, markets, strategy, key customers",
    },
    "unknown": {
        "estimated_gain": 4,
        "description": "Unclassified source",
    },
}


# ── 2. GAP SEARCH DIRECTIVES ─────────────────────────────────────────────────
# Per intelligence element: what to specifically search for to fill this gap.
# These instructions are injected into the Gemini search prompt.
# Add new elements here as the KB schema grows.

GAP_SEARCH_DIRECTIVES = {
    "product_catalogue": """
Search for: complete product range, model numbers, series names, variants, SKUs.
Priority sources: official product pages, distributor listings, datasheet libraries, trade directories.
Look for: operating parameters (temperature, pressure, speed, load), materials, dimensions, available configurations.
""",

    "technical_differentiators": """
Search for: what makes this product technically superior, performance claims, comparison data.
Priority sources: technical white papers, trade press reviews, product comparison pages, patent filings.
Look for: specific performance advantages, failure modes prevented, benchmark data, engineer testimonials.
""",

    "certifications": """
Search for: all certifications held — ATEX, CE, ISO 9001/14001/45001, DNV GL, UL, FDA 21 CFR,
REACH, RoHS, GOST, EN standards, IECEx, NORSOK, API, ASME, PED.
Priority sources: official certification body registers (atexcertification.co.uk, sgs.com, tuv.com,
bureau-veritas.com, dnv.com, ul.com), company website compliance page, regulatory filings.
Look for: certificate numbers, scope of certification, issuing body, geographic coverage.
""",

    "case_studies": """
Search for: named projects, reference installations, application notes, customer success stories.
Priority sources: company case study page, trade press project coverage, industry awards listings,
conference papers, video testimonials.
Look for: sector, country, operational challenge solved, measurable outcome, customer name if public.
""",

    "competitive_positioning": """
Search for: how this company positions against competitors, market claims, comparison content.
Priority sources: company website positioning page, trade press comparison articles, distributor
product comparisons, industry analyst reports, Gartner/Forrester if applicable.
Look for: named competitors, win conditions, price positioning, market share claims.
""",

    "pricing_framework": """
Search for: the supplier's own pricing structure AND what resellers/retailers charge for the product.
Two distinct levels to find:
  1. SUPPLIER PRICING: list price, volume breaks, minimum order, rental vs purchase, service contract costs.
     Sources: company website pricing page, distributor agreements, tender awards, procurement platforms.
  2. CHANNEL / RETAIL PRICING: what webshops, distributors, and private label vendors actually charge end buyers.
     Sources: retailer webshops (search "[product name] buy online"), private label product pages,
     B2B supply catalogues (Lomax, RS Components, Grainger, Amazon Business), trade directories.
     Look for: shelf price, volume tier pricing (1 unit vs carton vs pallet), private label markup vs direct.
Extract: per-unit price, pack size pricing, volume break thresholds, currency, whether MissBlue brand is kept or
private-labelled, channel type (office supply, specialty tea/coffee, industrial distributor).
Note: only include verified prices with source URL — never estimate.
""",

    "distribution_channels": """
Search for: every sales channel through which this product reaches buyers — direct, retail, private label, B2B.
This is market channel intelligence, not just pricing.
Priority sources: retailer webshops selling the product, distributor catalogues, trade directory listings,
LinkedIn company page (partners section), company website (where to buy), press releases about new distribution deals.
Look for:
  - Named retailers and distributors stocking the product
  - Whether the product appears under its original brand or a private label at each channel
  - Which buyer segments each channel serves (office supply = workplace buyers; coffee specialty = prosumer)
  - Geographic coverage per channel
  - Estimated channel volume signals (volume pricing tiers, stock depth, review count)
  - Any exclusive distribution arrangements
Output: structured list of channels with: channel name, URL, brand used, price point, buyer segment, notes.
""",

    "reference_projects": """
Search for: named installations, completed projects, reference customers, project case studies.
Priority sources: company project page, press releases, industry news, conference presentations,
planning permission filings, EPC contractor announcements.
Look for: project name, location, customer, scale, completion date, supplier role.
""",

    "objections_responses": """
Search for: FAQs, common questions answered, comparison objections handled, sales content.
Priority sources: company FAQ page, sales brochures, trade press Q&A articles,
forum discussions mentioning the product, review sites (G2, Capterra if software-adjacent).
Look for: price objections, technical limitations acknowledged, competitor switch stories.
""",

    "buyer_profiles": """
Search for: who buys this product, job titles, industries, procurement routes.
Priority sources: LinkedIn employee data, trade association membership, conference speaker lists,
procurement platform buyer profiles, industry salary/role surveys.
Look for: decision maker titles (Plant Manager, Procurement Director, HSEQ Manager),
buying triggers, budget cycle information, trade show attendance patterns.
""",

    "operational_context": """
Search for: which industries and processes use this product, application environments.
Priority sources: company markets/sectors page, application notes, trade press sector coverage,
industry association reports, regulatory context documents.
Look for: named industries (oil & gas, food & beverage, pharmaceuticals), specific processes
(conveyor systems, heat treatment, clean rooms), facility types, geographic strongholds.
""",

    "technical_datasheets": """
Search for: downloadable datasheets, specification sheets, technical manuals, installation guides.
Priority sources: company download centre, distributor product pages, engineering databases
(IHS Markit, GlobalSpec, Engineering360), manufacturer part number databases.
Look for: PDF datasheets, performance curves, dimensional drawings, installation requirements.
""",

    "company_overview": """
Search for: company history, size, ownership, leadership team, mission.
Priority sources: company About page, LinkedIn company page, Companies House / Handelsregister /
Chamber of Commerce filings, Crunchbase, Bloomberg company profile, annual report.
Look for: founded date, employee count, revenue range, parent company, key executives.
""",
}


# ── 3. ELEMENT LABELS ────────────────────────────────────────────────────────
# Display names shown in the UI and in Gemini prompts

ELEMENT_LABELS = {
    "product_catalogue": "Product Catalogue",
    "technical_differentiators": "Technical Differentiators",
    "certifications": "Certifications & Compliance",
    "case_studies": "Case Studies & References",
    "competitive_positioning": "Competitive Positioning",
    "pricing_framework": "Pricing Framework",
    "reference_projects": "Reference Projects",
    "objections_responses": "Objections & Responses",
    "buyer_profiles": "Buyer Profiles",
    "operational_context": "Operational Context",
    "technical_datasheets": "Technical Datasheets",
    "company_overview": "Company Overview",
    "distribution_channels": "Distribution Channels & Channel Pricing",
}


# ── 4. SEARCH PRIORITIES ─────────────────────────────────────────────────────
# For each gap element, which source types should STRATALYST prioritise?
# Listed in order of preference. Used to rank findings in the brief.

SEARCH_PRIORITIES = {
    "product_catalogue":        ["datasheet", "company_website", "trade_directory", "distributor_page"],
    "technical_differentiators":["datasheet", "patent_database", "trade_press", "company_website"],
    "certifications":           ["certification_register", "regulatory", "company_website", "trade_directory"],
    "case_studies":             ["case_study", "trade_press", "company_website", "trade_show"],
    "competitive_positioning":  ["trade_press", "company_website", "annual_report", "trade_directory"],
    "pricing_framework":        ["retailer_webshop", "distributor_page", "trade_directory", "annual_report"],
    "distribution_channels":   ["retailer_webshop", "distributor_page", "company_website", "trade_directory", "linkedin"],
    "reference_projects":       ["case_study", "trade_press", "news_article", "trade_show"],
    "objections_responses":     ["company_website", "trade_press", "industry_association"],
    "buyer_profiles":           ["linkedin", "industry_association", "trade_show", "trade_press"],
    "operational_context":      ["company_website", "trade_press", "industry_association", "annual_report"],
    "technical_datasheets":     ["datasheet", "distributor_page", "company_website"],
    "company_overview":         ["linkedin", "company_website", "annual_report", "trade_directory"],
}
