type VenueRule = { abbr: string; keys: string[] };

const RULES: VenueRule[] = [
    { abbr: "CVPR", keys: ["cvpr", "computer vision and pattern recognition"] },
    { abbr: "ICCV", keys: ["iccv", "international conference on computer vision"] },
    { abbr: "ECCV", keys: ["eccv", "european conference on computer vision"] },

    { abbr: "NeurIPS", keys: ["neurips", "nips", "neural information processing systems"] },
    { abbr: "ICML", keys: ["icml", "international conference on machine learning"] },
    { abbr: "ICLR", keys: ["iclr", "international conference on learning representations"] },

    { abbr: "AAAI", keys: ["aaai", "association for the advancement of artificial intelligence"] },
    { abbr: "IJCAI", keys: ["ijcai", "international joint conference on artificial intelligence"] },

    { abbr: "ACL", keys: ["acl", "association for computational linguistics"] },
    { abbr: "EMNLP", keys: ["emnlp", "empirical methods in natural language processing"] },
    { abbr: "NAACL", keys: ["naacl", "north american chapter of the acl"] },

    { abbr: "KDD", keys: ["kdd", "knowledge discovery and data mining", "sigkdd"] },

    { abbr: "ICASSP", keys: ["icassp", "acoustics, speech, and signal processing"] },
    { abbr: "Interspeech", keys: ["interspeech"] },

    // graphics / vision / multimodal
    { abbr: "SIGGRAPH", keys: ["siggraph"] },
    { abbr: "SIGGRAPH Asia", keys: ["siggraph asia"] },
    { abbr: "BMVC", keys: ["bmvc", "british machine vision conference"] },
    { abbr: "WACV", keys: ["wacv", "winter conference on applications of computer vision"] },

    // robotics / embodied AI
    { abbr: "ICRA", keys: ["icra", "international conference on robotics and automation"] },
    { abbr: "IROS", keys: ["iros", "intelligent robots and systems"] },
    { abbr: "RSS", keys: ["rss", "robotics science and systems"] },

    // web / systems / data
    { abbr: "WWW", keys: ["www", "the web conference"] },
    { abbr: "CHI", keys: ["chi", "human factors in computing systems"] },
    { abbr: "UAI", keys: ["uai", "uncertainty in artificial intelligence"] },
];


const WORKSHOP_KEYS = ["workshop", "workshops", "workshop on", "wkshp", "ws"];

export function normalizeVenue(input: string): string {
    const s = (input ?? "").toLowerCase();
    const isWorkshop = WORKSHOP_KEYS.some((k) => s.includes(k));

    const hit = RULES.find((r) => r.keys.some((k) => s.includes(k)));
    if (!hit) return "";

    return hit.abbr + (isWorkshop ? " Workshop" : "");
}

export function parsePublishedAt(publishedAt: string): {
    venue: string;
    year: string | null;
} {
    const s = (publishedAt ?? "").trim();

    // match: "... 2023" or "... ,2023"
    const match = s.match(/^(.*?)[,\s]*([12]\d{3})$/);

    if (!match) {
        return {
            venue: s,
            year: null,
        };
    }

    const venue = match[1].trim();
    const year = match[2];

    return { venue, year };
}
