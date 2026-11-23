const paths = {
  brand: 'M4 19V5h8M4 11h6m4-6h6v14h-6m0-9h6m-6 4h6',
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z',
  people: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7-7.9a4 4 0 0 1 0 7.8',
  userPlus: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m7-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm10-5v6m-3-3h6',
  building: 'M3 21h18M5 21V5h10v16m0-11h4v11M8 9h4m-4 4h4m-4 4h4',
  briefcase: 'M3 7h18v13H3zM8 7V4h8v3M3 12a24 24 0 0 0 18 0m-9 0v3',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z',
  calendar: 'M3 6h18v15H3zM7 3v6m10-6v6M3 11h18',
  card: 'M3 5h18v14H3zM3 10h18m-14 5h4',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2Zm3 5h6m-6 4h6m-6 4h3',
  chart: 'M3 3v18h18M8 16v-4m5 4V8m5 8V5',
  book: 'M12 6c-3-2-6-2-9-1v14c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1Zm0 0v14',
  chat: 'M4 4h16v12H9l-5 4Zm4 5h8m-8 3h5',
  shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-4',
  alert: 'M12 3 2 20h20Zm0 6v4m0 3h.01',
  menu: 'M4 6h16M4 12h16M4 18h16',
  close: 'm6 6 12 12M18 6 6 18',
  arrow: 'M4 12h15m-6-6 6 6-6 6',
  chevron: 'm9 6 6 6-6 6',
  logout: 'M10 4H4v16h6m3-12 4 4-4 4m-5-4h12',
  search: 'm15.5 15.5 4 4M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z',
  check: 'm5 12 4 4L19 6',
  inbox: 'M3 13l3-8h12l3 8v6H3Zm0 0h5l2 3h4l2-3h5',
  eye: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6-10-6-10-6Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  eyeOff: 'm3 3 18 18M10 6a12 12 0 0 1 12 6 15 15 0 0 1-3 3M6 7a15 15 0 0 0-4 5s3.5 6 10 6a11 11 0 0 0 4-1',
};

export type IconName = keyof typeof paths;

export default function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">
      <path d={paths[name]} />
    </svg>
  );
}
