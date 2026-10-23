"""The sector tree, and the rules that put a company in it.

This is the part no crawler gives you and the reason a directory is worth
reading: Tracxn calls them "feeds" and pays analysts to maintain them. Here the
tree is written by hand and companies are placed by keyword rules over their own
words (name, tagline, description, tags, page title). Every placement is
explainable, which is more than the commercial databases offer.

Each sector: slug, name, one-line description, and the words that signal it.
Verticals are weighted above horizontals, because "software for hospitals" is a
more useful label than "software with a dashboard".
"""

SECTORS = [
    # ---- vertical SaaS: software for one industry ----
    {"slug": "healthtech-saas", "name": "Health & Medical SaaS",
     "desc": "Software for hospitals, clinics, diagnostics, pharmacy and patient care.",
     "words": ["hospital", "clinic", "patient", "medical", "healthcare", "health care", "doctor", "pharmacy",
               "diagnostic", "telemedicine", "ehr", "emr", "dental", "therapy", "mental health", "wellness"]},
    {"slug": "edtech-saas", "name": "Education SaaS",
     "desc": "Learning platforms, school and college administration, assessment and training.",
     "words": ["edtech", "education", "school", "college", "university", "student", "learning", "course",
               "teacher", "exam", "tutor", "curriculum", "lms", "upskilling", "coaching"]},
    {"slug": "fintech-saas", "name": "Finance & Fintech SaaS",
     "desc": "Lending, payments, banking infrastructure, wealth, insurance and accounting software.",
     "words": ["fintech", "lending", "loan", "credit", "payment", "payments", "banking", "bank", "neobank",
               "insurance", "insurtech", "wealth", "mutual fund", "invoice", "accounting", "gst", "tax",
               "payroll", "expense", "treasury", "upi", "kyc", "underwriting", "bookkeeping"]},
    {"slug": "logistics-saas", "name": "Logistics & Supply Chain SaaS",
     "desc": "Freight, warehousing, fleet, last-mile delivery and supply-chain visibility.",
     "words": ["logistics", "supply chain", "freight", "shipping", "warehouse", "fleet", "delivery",
               "last mile", "trucking", "courier", "inventory", "procurement", "distributor"]},
    {"slug": "retail-commerce-saas", "name": "Retail & Commerce SaaS",
     "desc": "Storefronts, point of sale, catalogue, pricing and seller tooling for commerce.",
     "words": ["ecommerce", "e-commerce", "retail", "retailer", "point of sale", "storefront",
               "merchant", "seller", "catalog", "catalogue", "d2c", "marketplace", "checkout", "kirana",
               "shopify", "omnichannel"]},
    {"slug": "realestate-construction-saas", "name": "Real Estate & Construction SaaS",
     "desc": "Property, leasing, facility management and construction project software.",
     "words": ["real estate", "property", "proptech", "construction", "contractor", "builder", "leasing",
               "tenant", "facility management", "architecture", "housing"]},
    {"slug": "agritech-saas", "name": "Agritech SaaS",
     "desc": "Farm management, agri supply chain, crop intelligence and rural commerce.",
     "words": ["agritech", "agriculture", "farm", "farmer", "crop", "agri", "dairy", "livestock",
               "irrigation", "soil", "harvest"]},
    {"slug": "mobility-travel-saas", "name": "Mobility & Travel SaaS",
     "desc": "Ride-hailing, travel booking, hospitality and transport operations software.",
     "words": ["mobility", "ride", "cab", "taxi", "travel", "flight", "hotel", "hospitality", "booking",
               "restaurant", "tourism", "ev charging", "parking"]},
    {"slug": "legal-compliance-saas", "name": "Legal, Risk & Compliance SaaS",
     "desc": "Contracts, regulatory filing, audit, fraud and compliance workflow.",
     "words": ["legal", "contract", "compliance", "regulatory", "audit", "governance", "litigation",
               "law firm", "fraud", "aml", "risk management", "due diligence"]},
    {"slug": "manufacturing-saas", "name": "Manufacturing & Industrial SaaS",
     "desc": "Factory operations, quality, maintenance, IoT and industrial automation software.",
     "words": ["manufacturing", "factory", "industrial", "production line", "shop floor",
               "predictive maintenance", "iiot", "industry 4.0", "quality control", "robotics"]},

    # ---- horizontal SaaS: software any industry buys ----
    {"slug": "ai-ml-platforms", "name": "AI & ML Platforms",
     "desc": "Model building, inference, agents, LLM tooling and applied AI platforms.",
     "words": ["artificial intelligence", "machine learning", "deep learning", "large language model",
               "generative ai", "ai agent", "computer vision", "natural language",
               "neural", "model training", "inference", "fine-tun", "vector database"]},
    {"slug": "devtools-infrastructure", "name": "Developer Tools & Infrastructure",
     "desc": "APIs, SDKs, cloud infrastructure, CI/CD, observability and engineering platforms.",
     "words": ["developer", "developers", "sdk", "devops", "infrastructure", "kubernetes",
               "deployment", "ci/cd", "observability", "monitoring", "open source", "database", "backend",
               "serverless", "sandbox", "code review", "low-code", "no-code", "integration"]},
    {"slug": "data-analytics", "name": "Data & Analytics",
     "desc": "Data pipelines, warehousing, business intelligence and reporting.",
     "words": ["analytics", "data platform", "data pipeline", "business intelligence", "dashboard",
               "data warehouse", "reporting", "metrics", "data science", "big data", "visualisation",
               "visualization"]},
    {"slug": "security-saas", "name": "Security & Privacy SaaS",
     "desc": "Application and cloud security, identity, privacy and threat detection.",
     "words": ["cybersecurity", "cyber security", "security", "privacy", "encryption", "authentication",
               "identity", "zero trust", "vulnerability", "threat", "penetration", "firewall",
               "data protection"]},
    {"slug": "sales-crm", "name": "Sales & CRM",
     "desc": "Pipeline, lead generation, outbound, revenue operations and CRM.",
     "words": ["crm", "sales", "pipeline", "lead generation", "leads", "prospecting",
               "outbound", "revenue operations", "sales enablement", "go-to-market"]},
    {"slug": "marketing-growth", "name": "Marketing & Growth",
     "desc": "Campaigns, email, SEO, attribution, influencer and growth tooling.",
     "words": ["marketing", "campaign", "email marketing", "advertis", "attribution", "growth",
               "engagement", "push notification", "influencer", "social media", "content marketing",
               "whatsapp"]},
    {"slug": "customer-support", "name": "Customer Support & Experience",
     "desc": "Helpdesk, chat, ticketing, voice and customer-experience platforms.",
     "words": ["customer support", "helpdesk", "help desk", "ticketing", "live chat", "chatbot",
               "customer service", "contact centre", "contact center", "call center", "customer experience",
               "conversational"]},
    {"slug": "hr-recruiting", "name": "HR & Recruiting",
     "desc": "Hiring, onboarding, performance, engagement and workforce management.",
     "words": ["human resource", "recruit", "hiring", "talent", "candidate", "applicant",
               "onboarding", "employee", "workforce", "attendance", "performance review", "staffing",
               "interview"]},
    {"slug": "collaboration-productivity", "name": "Collaboration & Productivity",
     "desc": "Project management, documents, scheduling, notes and team workflow.",
     "words": ["project management", "collaboration", "productivity", "workflow", "document",
               "spreadsheet", "whiteboard", "meeting", "scheduling", "calendar", "knowledge base",
               "workspace"]},
]

HORIZONTAL = {"ai-ml-platforms", "devtools-infrastructure", "data-analytics", "security-saas", "sales-crm",
              "marketing-growth", "customer-support", "hr-recruiting", "collaboration-productivity"}

OTHER = {"slug": "other-saas", "name": "Other B2B Software",
         "desc": "Indian software companies that do not sit cleanly in one of the sectors above.",
         "words": []}

ALL = SECTORS + [OTHER]
BY_SLUG = {s["slug"]: s for s in ALL}


def classify(text: str) -> tuple[str, list[str], dict]:
    """Return (best sector slug, every matching sector ranked, score per sector)."""
    low = " " + (text or "").lower().replace("\n", " ") + " "
    scores: dict[str, int] = {}
    for sec in SECTORS:
        hits = sum(1 for w in sec["words"] if w in low)
        if hits:
            scores[sec["slug"]] = hits * (1 if sec["slug"] in HORIZONTAL else 2)
    if not scores:
        return OTHER["slug"], [], {}
    ranked = sorted(scores.items(), key=lambda kv: (-kv[1], kv[0]))
    return ranked[0][0], [s for s, _ in ranked], scores
