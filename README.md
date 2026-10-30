CampusLoop AI 🎓

A student-focused marketplace for buying and selling campus essentials.

🌐 Live Demo: https://campusloop-ai.onrender.com/

📌 About the Project

CampusLoop AI is a web-based marketplace designed to help students buy and sell useful academic and everyday items, such as textbooks, calculators, lab equipment, and electronics.

The goal is to make exchanging affordable, reusable student resources easier while building toward an AI-powered marketplace experience.

🎯 Problem Statement

Students often need affordable textbooks, calculators, and laboratory materials. At the same time, other students may have unused items they no longer need.

CampusLoop aims to connect these students through one convenient marketplace.

💡 Proposed Solution

CampusLoop AI provides a simple interface where students can explore marketplace items, search for products, and filter listings by category.

The project is being developed toward a more intelligent experience with AI-assisted listings, price suggestions, and secure test payments.

✨ Current Features

- Browse sample marketplace products.
- Search for products.
- Filter products by category.
- Responsive marketplace interface.
- Live deployment using Render.
- Node.js and Express.js backend.

🚀 Planned Features

- AI Listing Assistant: Generate clear product descriptions from basic item details.
- AI Price Suggestions: Suggest listing prices based on product information.
- Natural-Language Search: Help students find products using everyday language.
- Database Integration: Store users, listings, and events in Supabase PostgreSQL.
- PayPal Sandbox: Demonstrate a test checkout and payment workflow.
- Seller Listings: Allow students to create and manage listings.

These features are planned and should be marked complete only after they have been implemented and tested.

🛠️ Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Hosting: Render
- Database: Supabase (PostgreSQL)
- Planned payments: PayPal Sandbox
- Planned AI: Free-tier AI API, subject to availability and usage limits

🖥️ Run Locally

Prerequisites

- Node.js and npm installed
- Git (optional, for version control)

Setup

1. Clone the repository:
   
   https://github.com/aryantiwari1208-rgb/campusloop-ai/tree/master

2. Move into the project directory:
   
   cd campusloop-ai

3. Install dependencies:
   
   npm install

4. Create a Supabase project, run `supabase-schema.sql` in its SQL Editor, then set these server environment variables:

   - `DATABASE_URL`: Supabase PostgreSQL connection string (use the pooler URL for hosted deployments when recommended by Supabase).
   - `SESSION_SECRET`: random secret with at least 32 bytes.

   Keep the database URL private. The app connects directly to PostgreSQL and uses parameterized queries; it does not expose a Supabase service key to the browser.

5. Start the server:
   
   node server.js

6. Open the website:
   
   http://localhost:3000

Make sure "index.html", "server.js", and "package.json" are in the expected locations. Adjust the commands if your repository uses a different folder structure.

The server seeds the sample products and events when their IDs are absent. Existing MongoDB users, products, events, and sessions are not copied automatically; export and import existing records before switching a live deployment. Existing MongoDB passwords can be copied as bcrypt hashes into `users.password_hash`.

To copy MongoDB users, products, and events into the configured PostgreSQL database, set both `MONGODB_URI` and `DATABASE_URL` and run `npm run migrate:mongo`. The migration upserts matching users by email and products/events by ID; review the target first because matching records are updated. It runs in a PostgreSQL transaction and does not remove source MongoDB records. Session records are not transferred, so users will sign in again.

🔒 Security

- Never commit API keys, passwords, or payment credentials to GitHub.
- Store secrets in environment variables.
- Use PayPal Sandbox for test transactions during development.
- Validate payment results on the server before marking an order as paid.

🎯 Project Goal

The long-term goal is to build a useful, student-friendly marketplace that combines web development, persistent data storage, AI assistance, and payment integration.

🤝 Contributions

Suggestions, feedback, and contributions are welcome as the project develops.

📄 License

A license has not yet been selected. Add an appropriate open-source license before inviting external contributions.

---

Built as a student project with the goal of making campus buying and selling simpler.
