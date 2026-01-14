import { useAuth } from "@/contexts/AuthContext";
import { useVersionControl } from "@/contexts/VersionControlContext";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

/**
 * Hook to handle cloud pull operations with payment plan restrictions
 * Without a verified payment plan, pull operations are blocked
 */
export function useCloudPull() {
  const { hasVerifiedPlan, user } = useAuth();
  const { pullFromCloud, isCloudEnabled } = useVersionControl();
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

  const pull = async (): Promise<void> => {
    if (!checkPullPermission()) {
      throw new Error("Pull operation requires a verified payment plan");
    }

    if (!isCloudEnabled) {
      throw new Error("Cloud sync is not enabled. Please open a model file first.");
    }

    try {
      await pullFromCloud();
    } catch (error) {
      console.error("Failed to pull from cloud:", error);
      toast.error(error instanceof Error ? error.message : "Failed to pull from cloud storage");
      throw error;
    }
  };

  return {
    pull,
    checkPullPermission,
    canPull: hasVerifiedPlan && !!user && isCloudEnabled,
  };
}
