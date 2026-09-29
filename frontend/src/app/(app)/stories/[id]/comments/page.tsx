import { Metadata } from "next";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return {
    title: `التعليقات - القصة ${id}`,
    description: "تعليقات القصة",
  };
}

export default async function StoryCommentsPage({ params }: Props) {
  const { id } = await params;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <Card>
        <CardBody>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">التعليقات</h1>
          <p className="text-gray-600">معرّف القصة: {id}</p>
          <p className="text-gray-500 mt-2">سيتم تحميل التعليقات هنا.</p>
        </CardBody>
      </Card>
    </div>
  );
}
