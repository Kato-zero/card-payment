module.exports = async (req, res) => {
  if (req.method !== "GET") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const referenceId = String(req.query?.referenceId || "").trim();

    if (!referenceId) {
      return res.status(400).json({
        success: false,
        message: "referenceId is required."
      });
    }

    const apiKey = process.env.LIPILA_API_KEY;

    if (!apiKey) {
      return res.status(500).json({
        success: false,
        message: "Payment configuration is missing."
      });
    }

    const url =
      "https://blz.lipila.io/api/v1/collections/check-status?referenceId=" +
      encodeURIComponent(referenceId);

    const response = await fetch(url, {
      method: "GET",
      headers: {
        accept: "application/json",
        "x-api-key": apiKey
      }
    });

    const text = await response.text();

    let data;

    try {
      data = JSON.parse(text);
    } catch {
      data = {
        message: text
      };
    }

    /*
     * IMPORTANT:
     * A temporary Lipila/API problem is NOT a failed payment.
     */

    if (response.status === 429) {
      return res.status(200).json({
        success: true,
        state: "pending",
        referenceId,
        message: "Payment is still being processed."
      });
    }

    if (response.status >= 500) {
      return res.status(200).json({
        success: true,
        state: "pending",
        referenceId,
        message: "Payment is still being processed."
      });
    }

    /*
     * Lipila may briefly not find a newly-created transaction.
     * Do not immediately tell the customer their payment failed.
     */
    if (response.status === 404) {
      return res.status(200).json({
        success: true,
        state: "pending",
        referenceId,
        message: "Waiting for payment confirmation."
      });
    }

    if (!response.ok) {
      return res.status(200).json({
        success: true,
        state: "pending",
        referenceId,
        message: "Waiting for payment confirmation."
      });
    }

    const status = String(data.status || "").trim().toLowerCase();

    if (
      status === "successful" ||
      status === "success" ||
      status === "completed"
    ) {
      return res.status(200).json({
        success: true,
        state: "successful",
        referenceId,
        data
      });
    }

    if (
      status === "failed" ||
      status === "failure" ||
      status === "cancelled" ||
      status === "canceled" ||
      status === "rejected"
    ) {
      return res.status(200).json({
        success: true,
        state: "failed",
        referenceId,
        data
      });
    }

    /*
     * Pending / Processing / Unknown:
     * ALWAYS keep waiting.
     */
    return res.status(200).json({
      success: true,
      state: "pending",
      referenceId,
      data
    });

  } catch (error) {
    console.error("CHECK PAYMENT STATUS ERROR:", error);

    /*
     * Network/server problem is not payment failure.
     */
    return res.status(200).json({
      success: true,
      state: "pending",
      message: "Waiting for payment confirmation."
    });
  }
};
