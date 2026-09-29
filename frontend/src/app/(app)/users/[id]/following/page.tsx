import { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `المتابَعون - المستخدم ${id}`,
    description: "قائمة المستخدمين الذين يتابعهم",
  };
}

export default async function UserFollowingPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardBody>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">المتابَعون</h1>
          <p className="text-gray-600">معرّف المستخدم: {id}</p>
          <p className="text-gray-500 mt-2">سيتم تحميل قائمة المتابَعين هنا.</p>
        </CardBody>
      </Card>
    </div>
  );
}
