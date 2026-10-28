const paths = {
  applications: "M5 4h14v17H5zM9 2v4m6-4v4M9 10h6m-6 4h6m-6 4h3",
  emails: "M3 5h18v14H3zM3 6l9 7 9-7",
  participants: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  volunteers: "M12 3l8 4v5c0 5-8 9-8 9s-8-4-8-9V7zM8 12l3 3 5-6",
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z",
  checkIn: "M4 8V4h4m8 0h4v4M4 16v4h4m8 0h4v-4M8 12l3 3 5-6",
  food: "M4 3v6a3 3 0 0 0 6 0V3M7 3v18M20 21V3c-5 3-5 9 0 9",
  points: "M12 3l2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9z",
  events: "M4 5h16v16H4zM4 10h16M8 3v4m8-4v4",
  shop: "M4 9h16l-1.2 11H5.2zM8.5 9V7a3.5 3.5 0 0 1 7 0v2",
  notifications: "M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0",
} as const;

export type SectionIconName = keyof typeof paths;

export function SectionIcon({ name }: { name: SectionIconName }) {
  return <svg aria-hidden="true" focusable="false" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d={paths[name]} /></svg>;
}
