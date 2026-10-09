import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { AuthGate } from "./AuthGate";
import { Shell } from "./Shell";
import { Login } from "@/routes/Login";
import { Spinner } from "@/components/ui";

const lz = <T extends Record<string, unknown>>(f: () => Promise<T>, k: keyof T) => lazy(() => f().then((m) => ({ default: m[k] as React.ComponentType })));

const Dashboard = lz(() => import("@/routes/Dashboard"), "Dashboard");
const Jobs = lz(() => import("@/routes/Jobs"), "Jobs");
const JobDetail = lz(() => import("@/routes/Jobs"), "JobDetail");
const Documents = lz(() => import("@/routes/Documents"), "Documents");
const NewDocument = lz(() => import("@/routes/Documents"), "NewDocument");
const DocumentPage = lz(() => import("@/routes/DocumentPage"), "DocumentPage");
const Customers = lz(() => import("@/routes/Customers"), "Customers");
const Suppliers = lz(() => import("@/routes/Customers"), "Suppliers");
const Catalogue = lz(() => import("@/routes/Catalogue"), "Catalogue");
const Settings = lz(() => import("@/routes/Settings"), "Settings");
const Activity = lz(() => import("@/routes/Activity"), "Activity");
const PublicDocument = lz(() => import("@/routes/PublicDocument"), "PublicDocument");
const Bills = lz(() => import("@/routes/Bills"), "Bills");
const Expenses = lz(() => import("@/routes/Expenses"), "Expenses");
const Banking = lz(() => import("@/routes/Banking"), "Banking");
const Reports = lz(() => import("@/routes/Reports"), "Reports");
const CashFlow = lz(() => import("@/routes/CashFlow"), "CashFlow");
const Budgets = lz(() => import("@/routes/Budgets"), "Budgets");
const Vat = lz(() => import("@/routes/Vat"), "Vat");
const Cis = lz(() => import("@/routes/Cis"), "Cis");
const Payroll = lz(() => import("@/routes/Payroll"), "Payroll");
const Projects = lz(() => import("@/routes/Projects"), "Projects");
const Tax = lz(() => import("@/routes/Tax"), "Tax");

export function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/d/:token" element={<PublicDocument />} />
        <Route
          element={
            <AuthGate>
              <Shell />
            </AuthGate>
          }
        >
          <Route index element={<Dashboard />} />
          <Route path="jobs" element={<Jobs />} />
          <Route path="jobs/:id" element={<JobDetail />} />
          <Route path="documents" element={<Documents />} />
          <Route path="documents/new" element={<NewDocument />} />
          <Route path="documents/:id" element={<DocumentPage />} />
          <Route path="customers" element={<Customers />} />
          <Route path="suppliers" element={<Suppliers />} />
          <Route path="bills" element={<Bills />} />
          <Route path="expenses" element={<Expenses />} />
          <Route path="banking" element={<Banking />} />
          <Route path="reports" element={<Reports />} />
          <Route path="cashflow" element={<CashFlow />} />
          <Route path="budgets" element={<Budgets />} />
          <Route path="vat" element={<Vat />} />
          <Route path="cis" element={<Cis />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="projects" element={<Projects />} />
          <Route path="tax" element={<Tax />} />
          <Route path="catalogue" element={<Catalogue />} />
          <Route path="activity" element={<Activity />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
