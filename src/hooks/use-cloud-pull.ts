import { useAuth } from "@/contexts/AuthContext";
import { desktopAPI } from "@/lib/desktop-api";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

/**
 * Hook to handle cloud pull operations with payment plan restrictions
 * Without a verified payment plan, pull operations are blocked
 */
export function useCloudPull() {
  const { hasVerifiedPlan, user } = useAuth();
  const navigate = useNavigate();

  const checkPullPermission = (): boolean => {
    if (!hasVerifiedPlan) {
      toast.error(
        "Pull from cloud storage requires a verified payment plan. Please select a plan in the Dashboard.",
        {
          action: {
            label: "Go to Dashboard",
            onClick: () => navigate("/dashboard"),
          },
        }
      );
      return false;
    }
    return true;
  };

  const gitPull = async (): Promise<void> => {
    if (!checkPullPermission()) {
      throw new Error("Pull operation requires a verified payment plan");
    }

    if (!desktopAPI.isDesktop) {
      throw new Error("Pull operations are only available in desktop mode");
    }

    try {
      await desktopAPI.gitPull();
      toast.success("Successfully pulled changes from cloud storage");
    } catch (error) {
      console.error("Failed to pull changes:", error);
      toast.error(error instanceof Error ? error.message : "Failed to pull changes");
      throw error;
    }
  };

  return {
    gitPull,
    checkPullPermission,
    canPull: hasVerifiedPlan && !!user,
  };
}
