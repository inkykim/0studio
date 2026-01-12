import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, GraduationCap, Building2, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { TitleBar } from "@/components/TitleBar";
import { ModelProvider } from "@/contexts/ModelContext";
import { VersionControlProvider } from "@/contexts/VersionControlContext";

export default function Dashboard() {
  const { user, paymentPlan, setPaymentPlan, hasVerifiedPlan } = useAuth();
  const navigate = useNavigate();

  const handleSelectPlan = async (plan: 'student' | 'enterprise') => {
    await setPaymentPlan(plan);
  };

  return (
    <VersionControlProvider>
      <ModelProvider>
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          <TitleBar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </Button>
          </div>

          {/* Payment Plan Selection */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Select Your Payment Plan</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Choose a plan to unlock all features. Without a verified plan, you can make commits but cannot pull from cloud storage.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Student Plan */}
              <Card className={paymentPlan === 'student' ? 'border-primary ring-2 ring-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <GraduationCap className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Student</CardTitle>
                      <CardDescription>Perfect for students and individual creators</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Unlimited commits</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Cloud storage access</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Pull from cloud storage</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>All core features</span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={paymentPlan === 'student' ? 'default' : 'outline'}
                    onClick={() => handleSelectPlan('student')}
                  >
                    {paymentPlan === 'student' ? 'Selected' : 'Select Student Plan'}
                  </Button>
                </CardFooter>
              </Card>

              {/* Enterprise Plan */}
              <Card className={paymentPlan === 'enterprise' ? 'border-primary ring-2 ring-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Building2 className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <CardTitle>Enterprise</CardTitle>
                      <CardDescription>For teams and professional workflows</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Everything in Student</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Priority support</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Advanced collaboration</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Team management</span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={paymentPlan === 'enterprise' ? 'default' : 'outline'}
                    onClick={() => handleSelectPlan('enterprise')}
                  >
                    {paymentPlan === 'enterprise' ? 'Selected' : 'Select Enterprise Plan'}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>

          {/* Current Status */}
          {hasVerifiedPlan && (
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Plan Active
                </CardTitle>
                <CardDescription>
                  Your {paymentPlan === 'student' ? 'Student' : 'Enterprise'} plan is active. All features are unlocked.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Feature Limitations */}
          {!hasVerifiedPlan && (
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardHeader>
                <CardTitle>Limited Features</CardTitle>
                <CardDescription>
                  Without a verified payment plan, some features are restricted:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <span><strong>Available:</strong> You can make commits to track your work</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <span><strong>Restricted:</strong> Pull from cloud storage requires a verified plan</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </div>
      </ModelProvider>
    </VersionControlProvider>
  );
}
