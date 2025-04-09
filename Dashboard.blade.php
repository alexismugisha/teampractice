<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Website Interface</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    /* Reset & base */
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', sans-serif;
      line-height: 1.6;
      background-color: #f9f9f9;
      color: #333;
    }

    a {
      text-decoration: none;
      color: inherit;
    }

    /* Navbar */
    header {
      background: #1e1e2f;
      color: #fff;
      padding: 1rem 2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    nav a {
      margin-left: 1.5rem;
      color: #fff;
      font-weight: bold;
    }

    /* Hero */
    .hero {
      text-align: center;
      padding: 4rem 2rem;
      background: linear-gradient(to right, #4facfe, #00f2fe);
      color: white;
    }

    .hero h1 {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .hero p {
      font-size: 1.2rem;
    }

    /* Features */
    .features {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
      gap: 2rem;
      padding: 4rem 2rem;
    }

    .feature {
      background: white;
      padding: 2rem;
      border-radius: 10px;
      box-shadow: 0 4px 8px rgba(0,0,0,0.05);
      text-align: center;
    }

    .feature h3 {
      margin-bottom: 0.5rem;
      color: #4facfe;
    }

    /* Footer */
    footer {
      background: #1e1e2f;
      color: #ccc;
      text-align: center;
      padding: 1.5rem 2rem;
      margin-top: 2rem;
    }

    @media (max-width: 600px) {
      .hero h1 {
        font-size: 2rem;
      }
    }
  </style>
</head>
<body>

  <header>
    <h2>Admin Dashboard</h2>
    <nav>
      <a href="#">Home</a>
      <a href="#">Features</a>
      <a href="#name">About</a>
      <a href="#">Contact</a>
    </nav>
  </header>

  <section class="hero">
    <h1>Welcome to Dashboard</h1>
    <p>Manage , organize , delete and update is made by admin.</p>
  </section>

  <section class="features">
    <div class="feature">
      <h3>Fast</h3>
      <p>Loads quickly on any device with optimized layout and minimal code.</p>
    </div>
    <div class="feature">
      <h3>Responsive</h3>
      <p>Looks great on phones, tablets, and desktops without extra effort.</p>
    </div>
    <div class="feature">
      <h3>Customizable</h3>
      <p>Easily modify styles, sections, and components to fit your brand.</p>
    </div>
  </section>

  <section id="name">

  </section>

  <footer>
  </footer>

</body>
</html>
