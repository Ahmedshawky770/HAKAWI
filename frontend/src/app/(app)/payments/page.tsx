"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { Payment } from "@/types/api";

export default function PaymentsPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPaymentHistory();
        setPayments(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "فشل تحميل المدفوعات");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-3xl font-bold text-gray-900 mb-6">سجل المدفوعات</h1>
      {payments.length === 0 ? (
        <p className="text-gray-600">لا توجد مدفوعات بعد.</p>
      ) : (
        <div className="space-y-4">
          {payments.map((payment) => (
            <Card key={payment.id}>
              <CardBody>
                <Link href={`/payments/${payment.id}`} className="block">
                  <h3 className="text-lg font-semibold text-gray-900 hover:text-blue-600">
                    معرّف الدفع: {payment.id}
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    الحالة: {payment.status}
                  </p>
                  <p className="text-lg font-bold text-gray-900 mt-2">
                    {payment.amount} {payment.currency}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {new Date(payment.createdAt).toLocaleDateString()}
                  </p>
                </Link>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
