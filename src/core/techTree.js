export const TECH_TREE = {
  bronzeWorking: {
    id: "bronzeWorking",
    name: "Bronze Working",
    cost: 6,
    prerequisites: [],
    unlocks: {
      units: ["spearman"],
    },
  },
  archery: {
    id: "archery",
    name: "Archery",
    cost: 6,
    prerequisites: ["bronzeWorking"],
    unlocks: {
      units: ["archer"],
    },
  },
  masonry: {
    id: "masonry",
    name: "Masonry",
    cost: 5,
    prerequisites: ["bronzeWorking"],
    unlocks: {
      buildings: ["monument"],
    },
  },
};

export const TECH_ORDER = ["bronzeWorking", "archery", "masonry"];
