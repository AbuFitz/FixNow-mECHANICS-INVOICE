import { useMemo } from "react";
import { useCollection, useDocs, usePayments, useSettings } from "./hooks";
import { buildLedger } from "./acct/ledger";
import { DEFAULT_ACCOUNTS } from "./defaults";

/** Loads every input of the books once and derives the ledger. */
export function useBooks() {
  const settings = useSettings();
  const docs = useDocs();
  const payments = usePayments();
  const bills = useCollection("bills");
  const expenses = useCollection("expenses");
  const bankTxns = useCollection("bank_txns");
  const bankAccounts = useCollection("bank_accounts");
  const payRuns = useCollection("pay_runs");
  const accounts = useCollection("accounts");
  const contacts = useCollection("contacts");

  const loading = [settings, docs, payments, bills, expenses, bankTxns, bankAccounts, payRuns, accounts, contacts].some((q) => q.isLoading);
  const accountList = accounts.data?.length ? accounts.data : DEFAULT_ACCOUNTS.map((a) => ({ ...a, id: a.code }));

  const ledger = useMemo(() => {
    if (!settings.data) return [];
    return buildLedger({
      docs: docs.data ?? [], payments: payments.data ?? [], bills: bills.data ?? [], expenses: expenses.data ?? [],
      bankTxns: bankTxns.data ?? [], payRuns: payRuns.data ?? [], settings: settings.data, accounts: accountList,
    });
  }, [settings.data, docs.data, payments.data, bills.data, expenses.data, bankTxns.data, payRuns.data, accountList]);

  return {
    loading,
    settings: settings.data!,
    docs: docs.data ?? [],
    payments: payments.data ?? [],
    bills: bills.data ?? [],
    expenses: expenses.data ?? [],
    bankTxns: bankTxns.data ?? [],
    bankAccounts: bankAccounts.data ?? [],
    payRuns: payRuns.data ?? [],
    accounts: accountList,
    contacts: contacts.data ?? [],
    ledger,
  };
}
