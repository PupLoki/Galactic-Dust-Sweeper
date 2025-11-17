# Galactic Dust Sweeper

Work in progress web idle/clicker game. Everything is subject to change and balances/content are still being tuned.

## Setup
- Open `index.html` in a browser, or serve the folder statically (e.g., `python -m http.server 8000`).

## Save data
- Saves live in browser `localStorage` per domain. Clearing site data will reset progress.

## License
- MIT (see `LICENSE`).

## Console note
- If you see `A listener indicated an asynchronous response... message channel closed` in the console, it’s usually from a browser extension (ad blocker/privacy helper). It’s harmless for the game. To silence it completely, test in a clean/incognito profile with extensions disabled—web code can’t bypass or suppress the extensions themselves.
