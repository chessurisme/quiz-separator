# Quiz Separator

A web application for merging multiple quiz files and batch-generating difficulty-balanced quiz packs.

## Features

- **Import Multiple Quizzes** — Drag-and-drop or click to import JSON quiz files
- **Unified Pool** — Merge all questions from imported quizzes into a single pool
- **Batch Generation** — Automatically generate quiz packs with balanced difficulty distribution (5 Easy, 3 Medium, 2 Hard per pack)
- **Smart Leftovers** — Handle remaining questions that don't form complete packs
- **Persistent State** — All data is saved to browser storage and survives page refreshes
- **Undo/Cancel** — Cancel generation and return all questions to the pool
- **Download All** — Export all generated packs at once with visual feedback

## Getting Started

1. Open `index.html` in a web browser
2. Drop or select JSON quiz files to import
3. Review imported quizzes and pool statistics
4. Click "Generate Quiz Packs" to create balanced packs
5. Download individual packs or all at once
6. Handle leftover questions (download, keep in pool, or discard)

## Quiz JSON Format

Import files should have this structure:

```json
{
  "id": "optional-quiz-id",
  "name": "Quiz Name",
  "questions": [
    {
      "question": "Question text",
      "choices": ["Option A", "Option B", "Option C", "Option D"],
      "difficulty": "easy",
      "references": "Optional reference material"
    }
  ]
}
```

**Required:** `questions` array
**Optional:** `id`, `name`, `references` on individual questions

## Download Format

Generated packs are exported as clean JSON arrays of questions (internal metadata removed).

## Files

- `index.html` — HTML structure
- `app.js` — Core logic and state management
- `styles.css` — Complete styling with design tokens

## Browser Support

Works in all modern browsers with ES6 and localStorage support.
