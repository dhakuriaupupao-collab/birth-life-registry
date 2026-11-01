import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/worker_applications/$type")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/worker-applications/$type",
      params: { type: params.type },
    });
  },
});
