import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

export class AdministrativeErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  override state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Administrative application view failed to render", error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-8 max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center">
          <h2 className="font-display text-lg font-bold text-red-950">আবেদন তালিকা লোড করা যায়নি</h2>
          <p className="mt-2 text-sm text-red-800">Application list could not be displayed. Please return and try again.</p>
          <Button className="mt-4" variant="outline" onClick={() => window.location.reload()}>
            Reload page
          </Button>
        </div>
      );
    }
    return this.props.children;
  }
}
