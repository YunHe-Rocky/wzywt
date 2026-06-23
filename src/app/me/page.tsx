import { RolePreferenceEditor } from "@/components/me/RolePreferenceEditor";
import { HeroPowerEditor } from "@/components/me/HeroPowerEditor";

export default function MePage() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-bold">个人空间</h1>
      <RolePreferenceEditor />
      <HeroPowerEditor />
    </div>
  );
}
