export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  prompt: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    id: "crm",
    name: "CRM Dashboard",
    description: "Contacts, pipeline, and activity feed",
    prompt:
      "Build a CRM dashboard with contact list, deal pipeline kanban, activity timeline, and search. Use a modern admin UI with sidebar navigation.",
  },
  {
    id: "pos",
    name: "Restaurant POS",
    description: "Menu, orders, and kitchen display",
    prompt:
      "Build a restaurant POS with menu categories, cart checkout, order status board, and a simple admin panel for menu management.",
  },
  {
    id: "saas",
    name: "SaaS Landing",
    description: "Marketing site with pricing",
    prompt:
      "Build a SaaS marketing site with hero, features grid, pricing table, FAQ, and sign-up CTA. Include responsive layout and dark mode.",
  },
  {
    id: "inventory",
    name: "Inventory Tracker",
    description: "Stock levels and suppliers",
    prompt:
      "Build an inventory management app with product list, stock alerts, supplier directory, and CSV export.",
  },
  {
    id: "booking",
    name: "Booking System",
    description: "Calendar appointments",
    prompt:
      "Build an appointment booking app with weekly calendar, service selection, customer form, and confirmation emails UI.",
  },
];
