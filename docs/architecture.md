# Directory Structure

Below is the initial recommended directory structure for the app. Expect changes as we progress through the project. Update this document as needed.

```
app/
├── (auth)/           # Auth screens (login, signup, onboarding)
├── (tabs)/           # Main app tabs
├── _layout.tsx
├── globals.css
components/
├── ui/               # Reusable UI components (buttons, inputs, cards)
├── forms/            # Form components
├── layout/           # Layout components (headers, navigation)
├── audio/            # Audio player components
├── offline/          # Offline indicator, download progress
hooks/                # Custom React hooks
services/
├── api.ts            # Fluent API client setup
├── auth.ts           # Auth0 integration
├── database.ts       # SQLite database setup & migrations
├── storage.ts        # AsyncStorage wrapper
├── downloads.ts      # File download manager
├── sync.ts           # Offline sync engine
├── audio.ts          # Audio playback service
db/
├── migrations
├── ...
├── repositories/     # Data access layer (SQLite queries)
  ├── books.ts
  ├── chapters.ts
  ├── ...
stores/               # State management
types/                # TypeScript definitions
utils/                # Helper functions
constants/            # App constants, theme, config
```