type VenueRule = { abbr: string; keys: string[] };

const RULES: VenueRule[] = [
    { abbr: "CVPR", keys: ["cvpr", "computer vision and pattern recognition"] },
    { abbr: "ICCV", keys: ["iccv", "international conference on computer vision"] },
    { abbr: "ECCV", keys: ["eccv", "european conference on computer vision"] },
    { abbr: "NeurIPS", keys: ["neurips", "nips", "neural information processing systems"] },
    { abbr: "ICML", keys: ["icml", "international conference on machine learning"] },
    { abbr: "ICLR", keys: ["iclr", "international conference on learning representations"] },
    { abbr: "AAAI", keys: ["aaai"] },
    { abbr: "IJCAI", keys: ["ijcai"] },
    { abbr: "ACL", keys: ["acl", "association for computational linguistics"] },
    { abbr: "EMNLP", keys: ["emnlp", "empirical methods in natural language processing"] },
    { abbr: "KDD", keys: ["kdd", "knowledge discovery and data mining", "sigkdd"] },
    { abbr: "ICASSP", keys: ["icassp", "acoustics, speech, and signal processing"] },
];

const WORKSHOP_KEYS = ["workshop", "workshops", "workshop on", "wkshp", "ws"];

export function normalizeVenue(input: string): string {
    const s = (input ?? "").toLowerCase();
    const isWorkshop = WORKSHOP_KEYS.some((k) => s.includes(k));

    const hit = RULES.find((r) => r.keys.some((k) => s.includes(k)));
    if (!hit) return "";

    return hit.abbr + (isWorkshop ? " Workshop" : "");
}
