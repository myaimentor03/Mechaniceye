import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
  items?: string[];
}

export function ComingSoon({ title, description, items }: ComingSoonProps) {
  return (
    <Card className="border-dashed">
      <CardContent className="p-6 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Lock className="w-4 h-4" />
              {title}
            </h3>
            {description ? (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            ) : null}
          </div>
          <Badge variant="secondary">Coming Soon</Badge>
        </div>

        {items && items.length > 0 ? (
          <ul className="text-sm space-y-2">
            {items.map((it) => (
              <li key={it} className="flex gap-2">
                <span className="text-muted-foreground">•</span>
                <span>{it}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="text-xs text-muted-foreground">
          This is intentionally locked for the launch version so the core diagnosis flow stays fast and reliable.
        </p>
      </CardContent>
    </Card>
  );
}
