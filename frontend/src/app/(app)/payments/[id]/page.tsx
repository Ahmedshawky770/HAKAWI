"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { Card, CardBody } from "@/components/ui/Card";
import { Loading } from "@/components/ui/Loading";
import { ErrorMessage } from "@/components/ui/ErrorMessage";
import { Payment } from "@/types/api";

export default function PaymentDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const data = await api.getPayment(id);
        setPayment(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load payment");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  if (loading) return <Loading />;
  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!payment) return <div className="p-6">Payment not found</div>;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <Link href="/payments" className="text-blue-600 hover:text-blue-500">
          ← Back to payments
        </Link>
      </div>
      <Card>
        <CardBody>
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Payment Details</h1>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Payment ID</p>
              <p className="font-mono text-sm">{payment.id}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Book ID</p>
              <p className="font-mono text-sm">{payment.bookId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Buyer ID</p>
              <p className="font-mono text-sm">{payment.buyerId}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Amount</p>
              <p className="text-2xl font-bold text-gray-900">${payment.salePrice.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Purchased At</p>
              <p className="text-sm">{new Date(payment.purchasedAt).toLocaleString()}</p>
            </div>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
