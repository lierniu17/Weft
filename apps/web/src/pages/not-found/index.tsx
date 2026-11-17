import { useNavigate } from "react-router";
import { EmptyState } from "../../components/composites/EmptyState/EmptyState.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";

/** Any unknown URL. */
export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <>
      <NavBar title="Weft" variant="pushed" onBack={() => navigate("/")} />
      <EmptyState
        variant="not-found"
        title="这个页面不存在"
        description="链接可能有误"
        actionLabel="回到对话"
        onAction={() => navigate("/")}
      />
    </>
  );
}
