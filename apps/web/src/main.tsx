import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./Layout";
import { Home } from "./pages/Home";
import { Locator } from "./pages/Locator";
import { Community } from "./pages/Community";
import { Business } from "./pages/Business";
import { About } from "./pages/About";
import "./styles.css";

const cache = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={cache}>
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="locator" element={<Locator />} />
          <Route path="community" element={<Community />} />
          <Route path="business" element={<Business />} />
          <Route path="about" element={<About />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </QueryClientProvider>,
);
