# Poda Barber's — Website

A fast, responsive marketing website for **Poda Barber's**, a well-trusted
traditional barbershop in Hove, East Sussex (formerly *H's Barbershop*).

## About the site

Static, dependency-free site built with plain HTML, CSS and a small amount of
vanilla JavaScript — no build step required. It highlights the shop's services,
story, reviews, opening hours and contact details, and is optimised for local
search (SEO meta tags + `HairSalon` structured data).

### Highlights
- Classic barbershop look — charcoal + brass/gold, strong condensed type.
- Fully responsive with a mobile menu and a sticky "Call" bar on phones.
- Click-to-call links throughout (**01273 568126**).
- SEO-ready: descriptive meta tags, Open Graph, and JSON-LD local business data.

## Files
| File | Purpose |
| --- | --- |
| `index.html` | Page markup and structured data |
| `styles.css` | All styling and responsive rules |
| `script.js` | Mobile nav toggle + footer year |

## Running locally
It's a static site — just open `index.html` in a browser, or serve the folder:

```bash
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Business details
- **Location:** Hove, East Sussex, UK
- **Phone:** 01273 568126
- **Hours:** Mon–Fri 9am–7pm · Sat 9am–5pm · Sun 10am–4pm
