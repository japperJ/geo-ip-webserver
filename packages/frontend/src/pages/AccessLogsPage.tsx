import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function AccessLogsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white">Access Logs</h1>
        <p className="mt-2 text-gray-400">
          View access control decisions and request logs.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Recent Access Logs</CardTitle>
          <CardDescription>
            A filterable list of all access control decisions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-12 text-gray-400">
            <p>Access logs will be displayed here.</p>
            <p className="text-sm mt-2">Coming in MVP-019</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
