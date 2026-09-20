import AdminGateGuard from '@/components/admin/AdminGateGuard';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <AdminGateGuard>{children}</AdminGateGuard>;
}
