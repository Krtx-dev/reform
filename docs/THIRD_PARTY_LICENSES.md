# Third-party dependencies

Runtime dependencies (versions as installed; see `package-lock.json` for the full tree):

| Package | Version | License | Use |
|---|---|---|---|
| next | 15.5.29 | MIT | Framework |
| react, react-dom | 19.1.0 | MIT | UI |
| konva / react-konva | 9.3.22 / 19.0.10 | MIT | Manufacturing canvas |
| zustand | 5.1.0 | MIT | State |
| dexie | 4.4.7 | Apache-2.0 | IndexedDB persistence |
| zod | 3.25.76 | MIT | Runtime validation |
| motion | 14.14.0 | MIT | UI transitions |
| gsap | 3.15.1 | GSAP Standard "no charge" license (https://gsap.com/standard-license) — not OSI-approved | Landing hero animation |
| lucide-react | 1.79.0 | ISC | Icons |
| sonner | 2.0.8 | MIT | Notifications |
| jspdf | 4.2.1 | MIT | PDF reports |
| geist | 1.9.2 | SIL Open Font License 1.1 | Geist Sans / Geist Mono fonts, bundled locally |
| tailwindcss | 4.x | MIT | Styling |

Development: TypeScript (Apache-2.0), ESLint (MIT), Vitest (MIT), Playwright (Apache-2.0), tsx (MIT).

OpenCV.js was considered for the scanner and deliberately not used: the required operations (Otsu threshold, connected component, convex hull, homography, inscribed rectangle) are implemented in ~200 lines in `core/vision/vision.ts`, keeping the bundle small.

All REFORM source code is original and MIT licensed (see `LICENSE`). Demo and benchmark data are synthetic and original.
