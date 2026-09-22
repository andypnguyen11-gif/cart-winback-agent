flowchart TB

    %% =========================
    %% USER / CLIENT
    %% =========================

    subgraph USER["Marketing User"]
        MARKETER["Marketer"]
    end

    subgraph CLIENT["Next.js Client / React UI"]
        PAGE["app/page.tsx"]

        SUMMARY["components/SummaryMetrics.tsx"]
        CARD["components/CartReviewCard.tsx"]
        BADGE["components/RecommendationBadge.tsx"]
        TRACE["components/DecisionTrace.tsx"]
        ACTIONS["components/ReviewActions.tsx"]
        EMPTY["components/EmptyState.tsx"]

        PAGE --> SUMMARY
        PAGE --> CARD
        CARD --> BADGE
        CARD --> TRACE
        CARD --> ACTIONS
        PAGE --> EMPTY
    end

    MARKETER -->|"Views review queue"| PAGE
    ACTIONS -->|"Approve / Edit / Reject"| PAGE


    %% =========================
    %% CLIENT → SERVER
    %% =========================

    PAGE -->|"POST /api/evaluate"| API

    subgraph SERVER["Next.js Server"]
        API["app/api/evaluate/route.ts"]

        PIPELINE["lib/pipeline.ts"]
        TYPES["lib/types.ts"]
        SCHEMAS["lib/schemas.ts"]
        CONFIG["lib/config.ts"]

        API --> PIPELINE
        API --> SCHEMAS
        PIPELINE --> TYPES
        PIPELINE --> SCHEMAS
        PIPELINE --> CONFIG
    end


    %% =========================
    %% SOURCE DATA
    %% =========================

    subgraph DATA["Application Data"]
        CARTS["data/carts.json"]
        REVIEWS["data/review-actions.json"]
    end

    CARTS -->|"Load stale carts"| API


    %% =========================
    %% POLICY ENGINE
    %% =========================

    subgraph POLICY["Deterministic Policy Engine"]
        ELIGIBILITY["lib/policy/eligibility.ts"]
        SEGMENTATION["lib/policy/segmentation.ts"]
        OFFER_RULES["lib/policy/offerRules.ts"]

        ELIGIBILITY --> SEGMENTATION
        SEGMENTATION --> OFFER_RULES
    end

    PIPELINE --> ELIGIBILITY

    ELIGIBILITY -->|"emailOptIn = false"| SUPPRESSED["SUPPRESSED"]
    ELIGIBILITY -->|"abandoned < stale threshold"| WAIT["WAIT"]
    ELIGIBILITY -->|"Eligible"| SEGMENTATION

    OFFER_RULES -->|"Allowed offers + max discount"| STRATEGIST


    %% =========================
    %% AI AGENTS
    %% =========================

    subgraph AGENTS["AI Agent Layer"]
        STRATEGIST["lib/agents/strategist.ts<br/>Claude Sonnet 5"]
        COPYWRITER["lib/agents/copywriter.ts<br/>Claude Haiku 4.5"]
        TONE["lib/agents/toneReviewer.ts<br/>Optional"]

        STRATEGIST --> COPYWRITER
        COPYWRITER -. optional .-> TONE
    end


    %% =========================
    %% ANTHROPIC API
    %% =========================

    subgraph EXTERNAL["External Services"]
        ANTHROPIC["Anthropic API"]
    end

    STRATEGIST -->|"Structured strategy request"| ANTHROPIC
    ANTHROPIC -->|"Offer + reason + evidence"| STRATEGIST

    COPYWRITER -->|"Generate email copy"| ANTHROPIC
    ANTHROPIC -->|"Subject + body"| COPYWRITER

    TONE -.->|"Tone review"| ANTHROPIC


    %% =========================
    %% VALIDATION
    %% =========================

    subgraph VALIDATION["Deterministic Safety Validation"]
        OFFER_VALIDATOR["lib/validation/validateOffer.ts"]
        EVIDENCE_VALIDATOR["lib/validation/validateEvidence.ts"]
        MESSAGE_VALIDATOR["lib/validation/validateMessage.ts"]
    end

    STRATEGIST --> OFFER_VALIDATOR
    STRATEGIST --> EVIDENCE_VALIDATOR

    OFFER_RULES -->|"Policy constraints"| OFFER_VALIDATOR
    CARTS -->|"Original source values"| EVIDENCE_VALIDATOR

    OFFER_VALIDATOR -->|"Valid"| COPYWRITER
    EVIDENCE_VALIDATOR -->|"Valid"| COPYWRITER

    OFFER_VALIDATOR -->|"Invalid"| REVIEW["NEEDS_REVIEW"]
    EVIDENCE_VALIDATOR -->|"Invalid"| REVIEW

    COPYWRITER --> MESSAGE_VALIDATOR
    MESSAGE_VALIDATOR -->|"Valid"| RESULT["Normalized Review Result"]
    MESSAGE_VALIDATOR -->|"Invalid"| REVIEW


    %% =========================
    %% RESPONSE TO CLIENT
    %% =========================

    SUPPRESSED --> RESULT
    WAIT --> RESULT
    REVIEW --> RESULT

    RESULT --> PIPELINE
    PIPELINE --> API

    API -->|"JSON review result"| PAGE

    RESULT --> TRACE
    RESULT --> CARD


    %% =========================
    %% MARKETER ACTIONS
    %% =========================

    ACTIONS -->|"Approved"| SAVE["Persist Review Action"]
    ACTIONS -->|"Edited"| SAVE
    ACTIONS -->|"Rejected + reason"| SAVE

    SAVE --> REVIEWS

    REVIEWS -->|"Load previous review state"| PAGE


    %% =========================
    %% EVALUATIONS
    %% =========================

    subgraph TESTS["Tests / Evaluation Harness"]
        POLICY_TEST["evals/policy.test.ts"]
        GOLDEN_TEST["evals/golden.test.ts"]
        GROUNDING_TEST["evals/grounding.test.ts"]
        CONSISTENCY_TEST["evals/consistency.test.ts"]
    end

    POLICY_TEST --> POLICY
    GOLDEN_TEST --> PIPELINE
    GROUNDING_TEST --> EVIDENCE_VALIDATOR
    CONSISTENCY_TEST --> STRATEGIST


    %% =========================
    %% DOCUMENTATION
    %% =========================

    subgraph DOCS["Project Documentation"]
        PRD["docs/PRD.md"]
        ARCH["docs/ARCHITECTURE.md"]
        DECISIONS["docs/DECISIONS.md"]
        REDIRECTS["REDIRECTS.md"]
        README["README.md"]
    end