/* GENERATED from the API's OpenAPI document by scripts/openapi.ts — do not edit; run `pnpm openapi`. */
export interface paths {
    "/api/account": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** Delete Account */
        delete: operations["delete_account_api_account_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/ask": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Ask */
        post: operations["ask_api_ask_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Login */
        post: operations["login_api_auth_login_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Logout */
        post: operations["logout_api_auth_logout_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Me */
        get: operations["me_api_auth_me_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Register */
        post: operations["register_api_auth_register_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/drafts/{draft_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Draft */
        get: operations["get_draft_api_drafts__draft_id__get"];
        /** Update Draft */
        put: operations["update_draft_api_drafts__draft_id__put"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/drafts/{draft_id}/confirm": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Confirm Draft */
        post: operations["confirm_draft_api_drafts__draft_id__confirm_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/drafts/{draft_id}/discard": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Discard Draft */
        post: operations["discard_draft_api_drafts__draft_id__discard_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/drafts/{draft_id}/questions/{question_id}/answer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Answer Draft Question
         * @description 补充追问: apply the clicked option, or the typed answer read by one model call
         *     (``not_understood`` leaves the Draft unchanged). Counts against no quota.
         */
        post: operations["answer_draft_question_api_drafts__draft_id__questions__question_id__answer_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/drafts/{draft_id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Retry Draft */
        post: operations["retry_draft_api_drafts__draft_id__retry_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/entries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Entries */
        get: operations["list_entries_api_entries_get"];
        put?: never;
        /** Submit Entry */
        post: operations["submit_entry_api_entries_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/entries/{entry_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Entry */
        get: operations["get_entry_api_entries__entry_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Panorama */
        get: operations["panorama_api_graph_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Health */
        get: operations["get_health_api_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/me/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Preferences */
        get: operations["get_preferences_api_me_preferences_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Update Preferences */
        patch: operations["update_preferences_api_me_preferences_patch"];
        trace?: never;
    };
    "/api/messages": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Messages */
        get: operations["list_messages_api_messages_get"];
        put?: never;
        /** Send Message */
        post: operations["send_message_api_messages_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/messages/{message_id}/clarify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Clarify Message
         * @description Click option ``option`` of the message's 反问 or 指代确认 (source ask: answers the
         *     option's question, counting nothing more); returns the updated message.
         */
        post: operations["clarify_message_api_messages__message_id__clarify_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/messages/{message_id}/reanswer": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * Reanswer Message
         * @description 「不接上文」: answer the message's question again without the earlier questions it was
         *     read with; counts one ask and replaces the answer. 409 if it was not read with any.
         */
        post: operations["reanswer_message_api_messages__message_id__reanswer_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/messages/{message_id}/reroute": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Reroute Message */
        post: operations["reroute_message_api_messages__message_id__reroute_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/persons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List Persons */
        get: operations["list_persons_api_persons_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/persons/{person_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Profile */
        get: operations["get_profile_api_persons__person_id__get"];
        put?: never;
        post?: never;
        /** Delete Person */
        delete: operations["delete_person_api_persons__person_id__delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/persons/{person_id}/deletion-impact": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Deletion Impact */
        get: operations["deletion_impact_api_persons__person_id__deletion_impact_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/persons/{person_id}/graph": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Local Graph */
        get: operations["local_graph_api_persons__person_id__graph_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/persons/{person_id}/profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Edit Profile */
        patch: operations["edit_profile_api_persons__person_id__profile_patch"];
        trace?: never;
    };
    "/api/persons/{person_id}/relationships/{other_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Pair */
        get: operations["get_pair_api_persons__person_id__relationships__other_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** Edit Pair */
        patch: operations["edit_pair_api_persons__person_id__relationships__other_id__patch"];
        trace?: never;
    };
    "/api/taxonomy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Taxonomy */
        get: operations["get_taxonomy_api_taxonomy_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/taxonomy/subtypes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Add Subtype */
        post: operations["add_subtype_api_taxonomy_subtypes_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/usage": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Usage */
        get: operations["get_usage_api_usage_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AddFactOp */
        AddFactOp: {
            /** Object */
            object: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            op: "add_fact";
            /** Predicate */
            predicate: string;
            /** Valid At */
            valid_at?: string | null;
        };
        /** AddSubtypeRequest */
        AddSubtypeRequest: {
            category: components["schemas"]["Category"];
            /** Name */
            name: string;
        };
        /** AffinityFeeling */
        AffinityFeeling: {
            confidence: components["schemas"]["Confidence"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            dimension: "affinity";
            /**
             * From
             * @description Person mention who feels
             */
            from: string;
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            level: components["schemas"]["AffinityLevel"];
            /**
             * To
             * @description Person mention the feeling is about
             */
            to: string;
        };
        /**
         * AffinityLevel
         * @enum {string}
         */
        AffinityLevel: "like" | "neutral" | "dislike";
        /** Answer */
        Answer: {
            /** Citations */
            citations: components["schemas"]["Citation"][];
            /** @description kind = clarify: the 指代确认 question and its candidates */
            clarify?: components["schemas"]["AnswerClarify"] | null;
            /**
             * Follow Ups
             * @description 追问建议, e.g. 「他俩什么时候认识的？」
             */
            follow_ups: string[];
            /**
             * Items
             * @description kind = list
             */
            items?: components["schemas"]["AnswerListItem"][] | null;
            kind: components["schemas"]["AnswerKind"];
            /**
             * Path
             * @description kind = path: ordered chain from the first person to the last
             */
            path?: components["schemas"]["PersonRef"][] | null;
            /**
             * Persons
             * @description Related persons, shown as chips (never Self)
             */
            persons: components["schemas"]["PersonRef"][];
            /** Segments */
            segments: components["schemas"]["AnswerSegment"][];
            /** @description kind = stat */
            stat?: components["schemas"]["AnswerStat"] | null;
        };
        /**
         * AnswerClarify
         * @description 指代确认 (conversation-context AC-1): a question and 2–4 candidates to pick from.
         */
        AnswerClarify: {
            /** Options */
            options: components["schemas"]["AnswerClarifyOption"][];
            /** Question */
            question: string;
        };
        /** AnswerClarifyOption */
        AnswerClarifyOption: {
            /**
             * Label
             * @description Who or which event, e.g. 「老周（周涛，大学同学）」
             */
            label: string;
            /**
             * Person Id
             * @description The person this option means (always in the user's graph)
             */
            person_id?: string | null;
            /**
             * Question
             * @description The full question answered when this is picked
             */
            question: string;
        };
        /**
         * AnswerKind
         * @enum {string}
         */
        AnswerKind: "text" | "path" | "list" | "stat" | "no_answer" | "clarify";
        /** AnswerListItem */
        AnswerListItem: {
            /** Citations */
            citations: number[];
            /**
             * Is Self
             * @description 本人: rendered as 「我」
             * @default false
             */
            is_self: boolean;
            /** Name */
            name: string;
            /** Person Id */
            person_id: string;
            /**
             * Subtitle
             * @description e.g. 同学 / 客户
             */
            subtitle?: string | null;
        };
        /**
         * AnswerQuestionRequest
         * @description Answer a 补充追问: click an option (no model call) or type an answer (one model call
         *     that may only change the question's field). Exactly one of the two.
         */
        AnswerQuestionRequest: {
            /**
             * Option
             * @description Index of the clicked option in question.options
             */
            option?: number | null;
            /**
             * Text
             * @description A typed answer (自己填)
             */
            text?: string | null;
        };
        /** AnswerSegment */
        AnswerSegment: {
            /**
             * Citations
             * @description Indices of the citations backing this piece of text
             * @default []
             */
            citations: number[];
            /** Text */
            text: string;
        };
        /** AnswerStat */
        AnswerStat: {
            /** Count */
            count: number;
            /** Persons */
            persons: components["schemas"]["PersonRef"][];
        };
        /** AskRequest */
        AskRequest: {
            /** Question */
            question: string;
        };
        /** Candidate */
        Candidate: {
            /** Name */
            name: string;
            /**
             * Note
             * @description Disambiguating hint, e.g. 同事 / 邻居
             */
            note?: string | null;
            /** Person Id */
            person_id: string;
        };
        /**
         * Category
         * @enum {string}
         */
        Category: "kin" | "romantic" | "social" | "interest" | "hostile";
        /** Citation */
        Citation: {
            confidence: components["schemas"]["Confidence"];
            /**
             * Entry Excerpt
             * @description Quote of the source Entry (记录原文)
             */
            entry_excerpt: string;
            /** Entry Id */
            entry_id: string;
            /** Index */
            index: number;
            /**
             * Is Opinion
             * @description Quotes 我的评价 (AC-23: 「你的评价」)
             * @default false
             */
            is_opinion: boolean;
            /**
             * Occurred On
             * @description The Entry's 发生日期, with precision
             * @example 2015
             * @example 2015-06
             * @example 2026-11-16
             */
            occurred_on: string;
            /**
             * Pair
             * @description The relationship this claim is about, for 「查看…的关系」
             */
            pair?: [
                components["schemas"]["PersonRef"],
                components["schemas"]["PersonRef"]
            ] | null;
            /**
             * Told By
             * @description Who said it, for 转述 (「据老张说」)
             */
            told_by?: string | null;
        };
        /**
         * CitationOut
         * @description 出处 (AC-25): one source Entry of an item, with the item's Confidence.
         */
        CitationOut: {
            confidence: components["schemas"]["Confidence"];
            /**
             * Entry Excerpt
             * @description 记录原文
             */
            entry_excerpt: string;
            /** Entry Id */
            entry_id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "user" | "manual_edit";
            /**
             * Occurred On
             * @description The Entry's 发生日期, with precision
             * @example 2015
             * @example 2015-06
             * @example 2026-11-16
             */
            occurred_on: string;
        };
        /** ClarifyOptionOut */
        ClarifyOptionOut: {
            /**
             * Intent
             * @description record: the original text becomes a 记录; ask: question is answered
             * @enum {string}
             */
            intent: "record" | "ask" | "record_ask";
            /**
             * Label
             * @description What clicking does: 「记下：…」「查：…」; 指代确认: 「老周（周涛，同学）」
             */
            label: string;
            /**
             * Person Id
             * @description 指代确认 (source ask): the person this candidate means; null otherwise
             */
            person_id: string | null;
            /**
             * Question
             * @description ask / record_ask: the question that is answered
             */
            question: string | null;
        };
        /**
         * ClarifyOut
         * @description 反问 (intent clarify): a concrete question about a 拿不准 message, with 1–3 options; or
         *     指代确认 (source ask, conversation context): which person / event a question meant, 2–4
         *     options. Clicking either goes through ``POST /api/messages/{id}/clarify``.
         */
        ClarifyOut: {
            /** Options */
            options: components["schemas"]["ClarifyOptionOut"][];
            /** Question */
            question: string;
            /**
             * Resolved
             * @description Settled (clicked, answered, re-routed): hide options
             */
            resolved: boolean;
            /**
             * Source
             * @description intent: 反问 of intent recognition; ask: 问答's 指代确认 (clicking is free)
             * @enum {string}
             */
            source: "intent" | "ask";
        };
        /** ClarifyRequest */
        ClarifyRequest: {
            /**
             * Option
             * @description Index of the clicked option in clarify.options
             */
            option: number;
        };
        /** ClosenessFeeling */
        ClosenessFeeling: {
            confidence: components["schemas"]["Confidence"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            dimension: "closeness";
            /**
             * From
             * @description Person mention who feels
             */
            from: string;
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            level: components["schemas"]["ClosenessLevel"];
            /**
             * To
             * @description Person mention the feeling is about
             */
            to: string;
        };
        /**
         * ClosenessLevel
         * @enum {string}
         */
        ClosenessLevel: "intimate" | "close" | "familiar" | "casual" | "distant";
        /**
         * Confidence
         * @enum {string}
         */
        Confidence: "witnessed" | "self_told" | "hearsay" | "inferred";
        /**
         * ConflictAction
         * @enum {string}
         */
        ConflictAction: "update" | "unverified";
        /** DeleteAccountRequest */
        DeleteAccountRequest: {
            /** Password */
            password: string;
        };
        /** DeleteFactOp */
        DeleteFactOp: {
            /** Fact Id */
            fact_id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            op: "delete_fact";
        };
        /** DeletionImpactOut */
        DeletionImpactOut: {
            /** Can Delete */
            can_delete: boolean;
            /** Entry Count */
            entry_count: number;
        };
        /** DimensionOut */
        DimensionOut: {
            current: components["schemas"]["FeelingOut"];
            /**
             * History
             * @description Oldest first
             */
            history: components["schemas"]["FeelingOut"][];
        };
        /**
         * DirectionOut
         * @description One direction's recorded dimensions; unrecorded dimensions are absent (AC-30).
         */
        DirectionOut: {
            /** Dimensions */
            dimensions: {
                [key: string]: components["schemas"]["DimensionOut"];
            };
            /** From Id */
            from_id: string;
            /** To Id */
            to_id: string;
        };
        /** Draft */
        Draft: {
            /** Facts */
            facts?: components["schemas"]["DraftFact"][];
            /** Feelings */
            feelings?: (components["schemas"]["ClosenessFeeling"] | components["schemas"]["AffinityFeeling"] | components["schemas"]["TrustFeeling"])[];
            /** Persons */
            persons?: components["schemas"]["DraftPerson"][];
            /** Profile */
            profile?: components["schemas"]["DraftProfileItem"][];
            /**
             * Questions
             * @description 补充追问, at most 2; server-owned (see module doc)
             */
            questions?: components["schemas"]["DraftQuestion"][];
            /** Relationships */
            relationships?: components["schemas"]["DraftRelationship"][];
        };
        /** DraftFact */
        DraftFact: {
            confidence: components["schemas"]["Confidence"];
            conflict?: components["schemas"]["FactConflict"] | null;
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            /** Object */
            object: string;
            /**
             * Predicate
             * @description e.g. WORKS_AT, LIKES, HAS_TRAIT, EXPERIENCED
             */
            predicate: string;
            /**
             * Subject
             * @description Person mention
             */
            subject: string;
            /** Valid At */
            valid_at?: string | null;
            /**
             * Valid To
             * @description End of a time span such as 上周末; not before valid_at
             */
            valid_to?: string | null;
        };
        /** DraftOut */
        DraftOut: {
            content: components["schemas"]["Draft"] | null;
            /**
             * Entry Id
             * Format: uuid
             */
            entry_id: string;
            /** Error */
            error: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            status: components["schemas"]["DraftStatus"];
        };
        /** DraftPerson */
        DraftPerson: {
            /** Candidates */
            candidates?: components["schemas"]["Candidate"][] | null;
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            match: components["schemas"]["PersonMatch"];
            /**
             * Mention
             * @description How the Entry refers to the person, e.g. 老张
             */
            mention: string;
            /**
             * Name
             * @description Display name of the matched person, e.g. 张伟
             */
            name?: string | null;
            /**
             * Note
             * @description Short hint about the matched person, e.g. 同事
             */
            note?: string | null;
            /** Person Id */
            person_id?: string | null;
        };
        /** DraftProfileItem */
        DraftProfileItem: {
            confidence: components["schemas"]["Confidence"];
            field: components["schemas"]["ProfileField"];
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            /**
             * Person
             * @description Person mention
             */
            person: string;
            /** Value */
            value: string;
        };
        /** DraftQuestion */
        DraftQuestion: {
            /**
             * Answer
             * @description The clicked option's label or the typed answer
             */
            answer?: string | null;
            /**
             * Answered
             * @default false
             */
            answered: boolean;
            field: components["schemas"]["QuestionField"];
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            /** Options */
            options: components["schemas"]["DraftQuestionOption"][];
            /**
             * Pair
             * @description The two person mentions asked about (relationship_type / met only)
             */
            pair?: [
                string,
                string
            ] | null;
            /**
             * Prompt
             * @description e.g. 小李是你的同事还是同学？
             */
            prompt: string;
        };
        /** DraftQuestionOption */
        DraftQuestionOption: {
            /**
             * Label
             * @description Button text, e.g. 同事
             */
            label: string;
            patch: components["schemas"]["QuestionPatch"];
        };
        /** DraftRef */
        DraftRef: {
            /**
             * Id
             * Format: uuid
             */
            id: string;
            status: components["schemas"]["DraftStatus"];
        };
        /** DraftRelationship */
        DraftRelationship: {
            confidence: components["schemas"]["Confidence"];
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            /**
             * Introduced By
             * @description Person mention of the introducer
             */
            introduced_by?: string | null;
            /** Met At */
            met_at?: string | null;
            /**
             * Origin
             * @description How they met (认识途径)
             */
            origin?: string | null;
            /**
             * Pair
             * @description Two person mentions; directional kin types read as pair[0] 是 pair[1] 的 X
             */
            pair: [
                string,
                string
            ];
            status?: components["schemas"]["RelationshipStatus"] | null;
            /** Types */
            types?: components["schemas"]["DraftRelationshipType"][];
        };
        /** DraftRelationshipType */
        DraftRelationshipType: {
            category: components["schemas"]["Category"];
            /**
             * Original
             * @description The Entry's own wording, e.g. 铁哥们
             */
            original: string;
            /** Subtype */
            subtype: string;
        };
        /**
         * DraftStatus
         * @enum {string}
         */
        DraftStatus: "extracting" | "pending" | "failed" | "confirmed" | "discarded";
        /** EntryDetailOut */
        EntryDetailOut: {
            draft: components["schemas"]["DraftOut"] | null;
            entry: components["schemas"]["EntryOut"];
            /**
             * Facts
             * @description Facts the Entry backs
             */
            facts: components["schemas"]["FactOut"][];
            /**
             * Learned Aliases
             * @description Aliases this Entry's confirmation added (AC-13); empty if none were new
             */
            learned_aliases: components["schemas"]["LearnedAliasOut"][];
            /**
             * Persons
             * @description Persons the confirmed Entry mentions
             */
            persons: components["schemas"]["PersonOut"][];
        };
        /** EntryOut */
        EntryOut: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            draft: components["schemas"]["DraftRef"] | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "user" | "manual_edit";
            /**
             * Occurred On
             * @description Date with precision: YYYY (year), YYYY-MM (month) or YYYY-MM-DD (day).
             * @example 2015
             * @example 2015-06
             * @example 2026-11-16
             */
            occurred_on: string;
            precision: components["schemas"]["Precision"];
            /** Text */
            text: string;
        };
        /** EntrySubmitted */
        EntrySubmitted: {
            draft: components["schemas"]["DraftOut"];
            entry: components["schemas"]["EntryOut"];
        };
        /** FactConflict */
        FactConflict: {
            action: components["schemas"]["ConflictAction"];
            /**
             * Old
             * @description The current value this fact conflicts with
             */
            old: string;
        };
        /** FactOut */
        FactOut: {
            /**
             * Citations
             * @description Every source Entry (AC-25)
             */
            citations: components["schemas"]["CitationOut"][];
            confidence: components["schemas"]["Confidence"];
            /** Current */
            current: boolean;
            /** Fact */
            fact: string;
            /** Id */
            id: string;
            /** Invalid At */
            invalid_at: string | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "fact" | "opinion";
            /** Object */
            object: string;
            /** Predicate */
            predicate: string;
            /**
             * Sources
             * @description Ids of the Entries backing this fact
             */
            sources: string[];
            /** Subject Id */
            subject_id: string;
            /** Unverified */
            unverified: boolean;
            /** Valid At */
            valid_at: string | null;
        };
        /** FeelingEditIn */
        FeelingEditIn: {
            /**
             * Dimension
             * @enum {string}
             */
            dimension: "closeness" | "affinity" | "trust";
            /**
             * Direction
             * @enum {string}
             */
            direction: "a_to_b" | "b_to_a";
            /** Level */
            level: string;
        };
        /** FeelingOut */
        FeelingOut: {
            /** Citations */
            citations: components["schemas"]["CitationOut"][];
            confidence: components["schemas"]["Confidence"];
            /** Id */
            id: string;
            /** Level */
            level: string;
            /**
             * Occurred At
             * @description Date with precision: YYYY (year), YYYY-MM (month) or YYYY-MM-DD (day).
             * @example 2015
             * @example 2015-06
             * @example 2026-11-16
             */
            occurred_at: string;
            /** Source */
            source: string;
        };
        /**
         * FollowedOut
         * @description An earlier question an answer was read with (上文, 「接着：…」).
         */
        FollowedOut: {
            /**
             * Message Id
             * Format: uuid
             */
            message_id: string;
            /** Question */
            question: string;
        };
        /** GraphEdgeOut */
        GraphEdgeOut: {
            /** @description The closer direction's level */
            closeness: components["schemas"]["ClosenessLevel"] | null;
            confidence: components["schemas"]["Confidence"];
            /** Id */
            id: string;
            /** Source */
            source: string;
            /** @description source's closeness to target (感受, this direction) */
            source_closeness: components["schemas"]["ClosenessLevel"] | null;
            status: components["schemas"]["RelationshipStatus"] | null;
            /** Target */
            target: string;
            /** @description target's closeness to source (感受, the other direction) */
            target_closeness: components["schemas"]["ClosenessLevel"] | null;
            /**
             * Types
             * @description types[0] is the primary type
             */
            types: components["schemas"]["RelationshipTypeOut"][];
        };
        /**
         * GraphGroupOut
         * @description 群体: a workplace, school or family with two or more members (Self never counted).
         */
        GraphGroupOut: {
            /** Id */
            id: string;
            /**
             * Kind
             * @enum {string}
             */
            kind: "family" | "organization" | "school";
            /** Member Ids */
            member_ids: string[];
            /** Name */
            name: string;
        };
        /** GraphNodeOut */
        GraphNodeOut: {
            /**
             * Anchor Person Id
             * @description Persons with no Relationship to Self (间接认识): the connected person nearest to Self, whose angle they sit near
             */
            anchor_person_id: string | null;
            /** Id */
            id: string;
            /** Is Self */
            is_self: boolean;
            /**
             * Met At
             * @description 认识时间: the Relationship with Self's met_at, else the 发生日期 of the first Entry mentioning the person; None for Self or when unknown
             */
            met_at: string | null;
            /** Name */
            name: string;
        };
        /** GraphOut */
        GraphOut: {
            /**
             * At
             * @description The time point shown; None = now
             */
            at: string | null;
            /** Center Id */
            center_id: string;
            /** Edges */
            edges: components["schemas"]["GraphEdgeOut"][];
            /** Groups */
            groups: components["schemas"]["GraphGroupOut"][];
            /** Nodes */
            nodes: components["schemas"]["GraphNodeOut"][];
            /**
             * Omitted
             * @description Persons left out by the 50-node cap (AC-33)
             */
            omitted: number;
            /** @description Panorama only: the time axis' range */
            timeline: components["schemas"]["GraphTimelineOut"] | null;
        };
        /**
         * GraphTheme
         * @enum {string}
         */
        GraphTheme: "light" | "starfield";
        /** GraphTimelineOut */
        GraphTimelineOut: {
            /**
             * From
             * @description The earliest 认识时间; None when nobody has one
             */
            from: string | null;
            /**
             * To
             * Format: date
             * @description Today
             */
            to: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HealthReport */
        HealthReport: {
            /** Status */
            status: string;
            /** Version */
            version: string;
        };
        /** IdentityOut */
        IdentityOut: {
            /** Citations */
            citations: components["schemas"]["CitationOut"][];
            confidence: components["schemas"]["Confidence"];
            /** Sources */
            sources: string[];
            /** Value */
            value: string;
        };
        /**
         * Intent
         * @enum {string}
         */
        Intent: "record" | "ask" | "record_ask" | "chitchat";
        /** LearnedAliasOut */
        LearnedAliasOut: {
            /** Alias */
            alias: string;
            /**
             * Name
             * @description The person's current name
             */
            name: string;
            /** Person Id */
            person_id: string;
        };
        /** LoginRequest */
        LoginRequest: {
            /** Password */
            password: string;
            /** Username */
            username: string;
        };
        /** MeResponse */
        MeResponse: {
            /** Display Name */
            display_name: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Self Person Id */
            self_person_id: string;
            /** Username */
            username: string;
        };
        /**
         * MessageEntryOut
         * @description The Entry a message became (记录), with its Draft.
         */
        MessageEntryOut: {
            draft: components["schemas"]["DraftOut"] | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * Occurred On
             * @description The Entry's 发生日期, with precision
             * @example 2015
             * @example 2015-06
             * @example 2026-11-16
             */
            occurred_on: string;
            precision: components["schemas"]["Precision"];
            /**
             * Text
             * @description The Entry text (for record_ask: only the new information)
             */
            text: string;
        };
        /** MessageOut */
        MessageOut: {
            /** @description ask / record_ask: the answer, with citations */
            answer: components["schemas"]["Answer"] | null;
            /**
             * Clarification Of
             * @description This message was typed as the answer to that message's 反问
             */
            clarification_of: string | null;
            /** @description 拿不准 with a 反问: shown instead of the fixed reply; null otherwise */
            clarify: components["schemas"]["ClarifyOut"] | null;
            /**
             * Confidence
             * @description Recognition confidence 0..1; null if none
             */
            confidence: number | null;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** @description record / record_ask: the Entry + Draft */
            entry: components["schemas"]["MessageEntryOut"] | null;
            /**
             * History Used Of
             * @description 上文: the earlier questions the answer was read with, oldest first; empty when it was answered on its own. Non-empty: show 「接着：<last question>」 and offer 「不接上文」 (POST /api/messages/{id}/reanswer)
             */
            history_used_of: components["schemas"]["FollowedOut"][];
            /** @description How the message is handled now (after any re-route) */
            intent: components["schemas"]["Intent"];
            /**
             * Message Id
             * Format: uuid
             */
            message_id: string;
            /** Problems */
            problems: components["schemas"]["ProblemOut"][];
            /** @description What recognition said; null for messages migrated from earlier Entries */
            recognized_intent: components["schemas"]["Intent"] | null;
            /**
             * Reply
             * @description chitchat: the short reply
             */
            reply: string | null;
            /** Text */
            text: string;
            /**
             * Uncertain
             * @description 拿不准: recognition was below the threshold
             */
            uncertain: boolean;
        };
        /** MessagePage */
        MessagePage: {
            /**
             * Has More
             * @description Older messages exist: pass the first message_id as before
             */
            has_more: boolean;
            /**
             * Messages
             * @description Oldest first; the newest message is last
             */
            messages: components["schemas"]["MessageOut"][];
        };
        /** PairEdited */
        PairEdited: {
            /**
             * Entry Id
             * Format: uuid
             */
            entry_id: string;
            pair: components["schemas"]["PairOut"];
        };
        /** PairOut */
        PairOut: {
            a: components["schemas"]["PersonOut"];
            a_to_b: components["schemas"]["DirectionOut"];
            b: components["schemas"]["PersonOut"];
            b_to_a: components["schemas"]["DirectionOut"];
            /** Facts */
            facts: components["schemas"]["FactOut"][];
            relationship: components["schemas"]["RelationshipOut"] | null;
        };
        /**
         * PersonMatch
         * @enum {string}
         */
        PersonMatch: "matched" | "ambiguous" | "new";
        /** PersonOut */
        PersonOut: {
            /** Aliases */
            aliases: string[];
            /** Id */
            id: string;
            /** Is Self */
            is_self: boolean;
            /** Name */
            name: string;
            /** Note */
            note?: string | null;
        };
        /** PersonRef */
        PersonRef: {
            /**
             * Is Self
             * @description 本人: rendered as 「我」
             * @default false
             */
            is_self: boolean;
            /** Name */
            name: string;
            /** Person Id */
            person_id: string;
        };
        /**
         * Precision
         * @enum {string}
         */
        Precision: "year" | "month" | "day";
        /** PreferencesOut */
        PreferencesOut: {
            /** @description 图谱外观: light = 浅色 (default), starfield = 星空 */
            graph_theme: components["schemas"]["GraphTheme"];
        };
        /**
         * PreferencesPatch
         * @description Only the fields given change; ``null`` is not a value.
         */
        PreferencesPatch: {
            /** @description Omit to keep */
            graph_theme?: components["schemas"]["GraphTheme"] | null;
        };
        /**
         * ProblemOut
         * @description A part of the message that could not be done; the other part still was (AC-7).
         */
        ProblemOut: {
            /**
             * Error
             * @description quota_exceeded | ask_failed | question_too_long | ...
             */
            error: string;
            /** Message */
            message: string;
            /**
             * Part
             * @enum {string}
             */
            part: "record" | "ask";
            /**
             * Resets At
             * @description quota_exceeded: the next 00:00 Beijing time
             */
            resets_at?: string | null;
        };
        /** ProfileEdited */
        ProfileEdited: {
            /**
             * Entry Id
             * Format: uuid
             * @description The 手动编辑记录 now backing the change
             */
            entry_id: string;
            profile: components["schemas"]["ProfileOut"];
        };
        /**
         * ProfileField
         * @enum {string}
         */
        ProfileField: "name" | "gender" | "birthday" | "hometown";
        /** ProfileOut */
        ProfileOut: {
            /** Facts */
            facts: components["schemas"]["FactOut"][];
            /** Identity */
            identity: {
                [key: string]: components["schemas"]["IdentityOut"];
            };
            person: components["schemas"]["PersonOut"];
            summary: components["schemas"]["SummaryOut"] | null;
        };
        /**
         * QuestionField
         * @enum {string}
         */
        QuestionField: "relationship_type" | "met" | "occurred";
        /**
         * QuestionPatch
         * @description The change one answer makes. Only the keys of the question's field may be set:
         *     ``types`` (relationship_type); ``met_at`` and / or ``origin`` (met); ``occurred`` (the
         *     Entry's 发生日期, re-timing the Draft's dates anchored on it).
         */
        QuestionPatch: {
            /** Met At */
            met_at?: string | null;
            /** Occurred */
            occurred?: string | null;
            /** Origin */
            origin?: string | null;
            /** Types */
            types?: components["schemas"]["DraftRelationshipType"][] | null;
        };
        /** QuotaOut */
        QuotaOut: {
            /** Limit */
            limit: number;
            /** Remaining */
            remaining: number;
            /** Used */
            used: number;
        };
        /** RegisterRequest */
        RegisterRequest: {
            /** Display Name */
            display_name: string;
            /** Invite Code */
            invite_code: string;
            /** Password */
            password: string;
            /** Username */
            username: string;
        };
        /** RelationshipEditRequest */
        RelationshipEditRequest: {
            /** Feelings */
            feelings?: components["schemas"]["FeelingEditIn"][];
            /** Met At */
            met_at?: string | null;
            /** Origin */
            origin?: string | null;
            status?: components["schemas"]["RelationshipStatus"] | null;
            /** Summary */
            summary?: string | null;
            /** Types */
            types?: components["schemas"]["RelationshipTypeIn"][] | null;
        };
        /** RelationshipOut */
        RelationshipOut: {
            /** Citations */
            citations: components["schemas"]["CitationOut"][];
            confidence: components["schemas"]["Confidence"];
            /** Id */
            id: string;
            introduced_by: components["schemas"]["PersonOut"] | null;
            /** Met At */
            met_at: string | null;
            /** Origin */
            origin: string | null;
            /** Person A */
            person_a: string;
            /** Person B */
            person_b: string;
            /** Sources */
            sources: string[];
            status: components["schemas"]["RelationshipStatus"] | null;
            /** Summary */
            summary: string | null;
            /**
             * Summary Generated At
             * @description None: written by the user
             */
            summary_generated_at: string | null;
            /** Types */
            types: components["schemas"]["RelationshipTypeOut"][];
        };
        /**
         * RelationshipStatus
         * @enum {string}
         */
        RelationshipStatus: "active" | "distant" | "tense" | "estranged";
        /** RelationshipTypeIn */
        RelationshipTypeIn: {
            category: components["schemas"]["Category"];
            /** Original */
            original: string;
            /** Subtype */
            subtype: string;
        };
        /** RelationshipTypeOut */
        RelationshipTypeOut: {
            category: components["schemas"]["Category"];
            /** Original */
            original: string;
            /** Subtype */
            subtype: string;
        };
        /** RerouteRequest */
        RerouteRequest: {
            /**
             * As
             * @description 改为记录 (record) / 改为提问 (ask)
             * @enum {string}
             */
            as: "record" | "ask";
        };
        /** SendMessageRequest */
        SendMessageRequest: {
            /** Text */
            text: string;
        };
        /** SetIdentityOp */
        SetIdentityOp: {
            field: components["schemas"]["ProfileField"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            op: "set_identity";
            /** Value */
            value: string;
        };
        /** SubmitEntryRequest */
        SubmitEntryRequest: {
            /**
             * Occurred On
             * @description Defaults to today (Beijing); YYYY, YYYY-MM or YYYY-MM-DD
             */
            occurred_on?: string | null;
            /** Text */
            text: string;
        };
        /**
         * SummaryOut
         * @description 综合描述 (AC-24): generated from the profile; regenerated after every change.
         */
        SummaryOut: {
            /**
             * Generated At
             * Format: date-time
             */
            generated_at: string;
            /** Text */
            text: string;
        };
        /** TaxonomyCategory */
        TaxonomyCategory: {
            category: components["schemas"]["Category"];
            /** Subtypes */
            subtypes: components["schemas"]["TaxonomySubtype"][];
        };
        /**
         * Taxonomy
         * @description The whole vocabulary visible to one user.
         */
        TaxonomyResponse: components["schemas"]["TaxonomyCategory"][];
        /** TaxonomySubtype */
        TaxonomySubtype: {
            /**
             * Custom
             * @description User-defined (自定义小类): visible only to this user
             * @default false
             */
            custom: boolean;
            /** Name */
            name: string;
        };
        /** TrustFeeling */
        TrustFeeling: {
            confidence: components["schemas"]["Confidence"];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            dimension: "trust";
            /**
             * From
             * @description Person mention who feels
             */
            from: string;
            /**
             * Id
             * @description Stable id of this item, unique within the draft
             */
            id: string;
            level: components["schemas"]["TrustLevel"];
            /**
             * To
             * @description Person mention the feeling is about
             */
            to: string;
        };
        /**
         * TrustLevel
         * @enum {string}
         */
        TrustLevel: "high" | "medium" | "low";
        /** UpdateDraftRequest */
        UpdateDraftRequest: {
            content: components["schemas"]["Draft"];
            /**
             * Occurred On
             * @description Move the Entry's 发生日期 (not in the future; YYYY, YYYY-MM or YYYY-MM-DD). The Draft's dates anchored on the old date are re-timed; nothing is re-extracted.
             */
            occurred_on?: string | null;
        };
        /** UpdateFactOp */
        UpdateFactOp: {
            /** Fact Id */
            fact_id: string;
            /** Object */
            object: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            op: "update_fact";
        };
        /** UsageOut */
        UsageOut: {
            ask: components["schemas"]["QuotaOut"];
            entry: components["schemas"]["QuotaOut"];
            /**
             * Resets At
             * Format: date-time
             * @description Next 00:00 Beijing time
             */
            resets_at: string;
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    delete_account_api_account_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["DeleteAccountRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    ask_api_ask_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AskRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Answer"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    login_api_auth_login_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["LoginRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    logout_api_auth_logout_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
        };
    };
    me_api_auth_me_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
        };
    };
    register_api_auth_register_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RegisterRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MeResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_draft_api_drafts__draft_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draft_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DraftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    update_draft_api_drafts__draft_id__put: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draft_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["UpdateDraftRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DraftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    confirm_draft_api_drafts__draft_id__confirm_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draft_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DraftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    discard_draft_api_drafts__draft_id__discard_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draft_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DraftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    answer_draft_question_api_drafts__draft_id__questions__question_id__answer_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draft_id: string;
                question_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AnswerQuestionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DraftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    retry_draft_api_drafts__draft_id__retry_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                draft_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            202: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DraftOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_entries_api_entries_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntryOut"][];
                };
            };
        };
    };
    submit_entry_api_entries_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SubmitEntryRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntrySubmitted"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_entry_api_entries__entry_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                entry_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["EntryDetailOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    panorama_api_graph_get: {
        parameters: {
            query?: {
                /** @description 关系大类，逗号分隔，如 social,kin */
                category?: string | null;
                /** @description 关系小类，逗号分隔，如 同学,室友 */
                subtype?: string | null;
                /** @description 亲密度至少到这一档 */
                closeness?: components["schemas"]["ClosenessLevel"] | null;
                /** @description 时间点（YYYY / YYYY-MM / YYYY-MM-DD，含当期最后一天）：只显示那时已认识的人，亲密度与关系按那时；不传为现在 */
                at?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GraphOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_health_api_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HealthReport"];
                };
            };
        };
    };
    get_preferences_api_me_preferences_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreferencesOut"];
                };
            };
        };
    };
    update_preferences_api_me_preferences_patch: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PreferencesPatch"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PreferencesOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_messages_api_messages_get: {
        parameters: {
            query?: {
                /** @description Only messages older than this message */
                before?: string | null;
                limit?: number;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessagePage"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    send_message_api_messages_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SendMessageRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    clarify_message_api_messages__message_id__clarify_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ClarifyRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reanswer_message_api_messages__message_id__reanswer_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    reroute_message_api_messages__message_id__reroute_post: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                message_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RerouteRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["MessageOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    list_persons_api_persons_get: {
        parameters: {
            query?: {
                /** @description 姓名或别名 */
                q?: string | null;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PersonOut"][];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_profile_api_persons__person_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                person_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    delete_person_api_persons__person_id__delete: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                person_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            204: {
                headers: {
                    [name: string]: unknown;
                };
                content?: never;
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    deletion_impact_api_persons__person_id__deletion_impact_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                person_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["DeletionImpactOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    local_graph_api_persons__person_id__graph_get: {
        parameters: {
            query?: {
                /** @description 1 层或 2 层 */
                hops?: number;
            };
            header?: never;
            path: {
                person_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GraphOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    edit_profile_api_persons__person_id__profile_patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                person_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SetIdentityOp"] | components["schemas"]["AddFactOp"] | components["schemas"]["UpdateFactOp"] | components["schemas"]["DeleteFactOp"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ProfileEdited"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_pair_api_persons__person_id__relationships__other_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                person_id: string;
                other_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PairOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    edit_pair_api_persons__person_id__relationships__other_id__patch: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                person_id: string;
                other_id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["RelationshipEditRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["PairEdited"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_taxonomy_api_taxonomy_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxonomyResponse"];
                };
            };
        };
    };
    add_subtype_api_taxonomy_subtypes_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AddSubtypeRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["TaxonomyResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_usage_api_usage_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["UsageOut"];
                };
            };
        };
    };
}
