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
- Database Integration: Planned for a future implementation.
- PayPal Sandbox: Demonstrate a test checkout and payment workflow.
- Seller Listings: Allow students to create and manage listings.

These features are planned and should be marked complete only after they have been implemented and tested.

🛠️ Technology Stack

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js, Express.js
- Hosting: Render
- Database: Not configured
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

4. No environment variables are required for the current non-persistent version.

5. Start the server:
   
   node server.js

6. Open the website:
   
   http://localhost:3000

Make sure "index.html", "server.js", and "package.json" are in the expected locations. Adjust the commands if your repository uses a different folder structure.

Marketplace listings, events, and authentication currently return HTTP 503 responses because persistent storage has been removed. The homepage, campus form, and recommendation assistant remain available.

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
