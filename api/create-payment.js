module.exports = async (req, res) => {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      message: "Method not allowed"
    });
  }

  try {
    const body = req.body || {};
    // Accept customerInfo (Lipila format) or flat fields
    const info = body.customerInfo || body;

    /*
     * ---------------------------------------------------------
     * BASIC SETTINGS
     * ---------------------------------------------------------
     */

    const paymentMethod = String(body.payment_method || "momo")
      .trim()
      .toLowerCase();

    const amount = Number(body.amount);

    // K50 minimum for BOTH MoMo and Card
    if (!Number.isFinite(amount) || amount < 50) {
      return res.status(400).json({
        success: false,
        message: "Minimum contribution is K50."
      });
    }

    // Lipila expects a valid positive amount
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment amount."
      });
    }

    /*
     * ---------------------------------------------------------
     * API KEY
     * ---------------------------------------------------------
     */

    const apiKey = process.env.LIPILA_API_KEY;

    if (!apiKey) {
      console.error("LIPILA_API_KEY is missing");

      return res.status(500).json({
        success: false,
        message: "Payment configuration is missing."
      });
    }

    /*
     * ---------------------------------------------------------
     * GENERATE UNIQUE REFERENCE
     * ---------------------------------------------------------
     */

    const referenceId =
      "DAFFODIL-" +
      Date.now() +
      "-" +
      Math.random().toString(36).substring(2, 8).toUpperCase();

    /*
     * ---------------------------------------------------------
     * CLEAN PHONE NUMBER
     * ---------------------------------------------------------
     */

    let phone = String(
      info.phone ||
      info.phoneNumber ||
      ""
    ).trim();

    let accountNumber = phone.replace(/\D/g, "");

    if (accountNumber.startsWith("0")) {
      accountNumber = "260" + accountNumber.substring(1);
    }


    // Accept any phone number with 7 to 15 digits
    if (accountNumber.length < 7 || accountNumber.length > 15) {
      return res.status(400).json({
        success: false,
        message: "Please enter a valid phone number."
      });
    }

    /*
     * =========================================================
     * MOBILE MONEY
     * =========================================================
     */

    if (paymentMethod === "momo") {
      const customerName = String(
        body.customer_name || ""
      ).trim();

      if (!customerName) {
        return res.status(400).json({
          success: false,
          message: "Customer name is required."
        });
      }

      const payload = {
        referenceId: referenceId,
        amount: amount,
        narration: String(body.narration || "Night of Laughter tickets").trim().slice(0, 100),
        accountNumber: accountNumber,
        currency: "ZMW",
        referenceData: customerName
      };

      console.log("Creating MoMo payment:", {
        referenceId,
        amount,
        paymentMethod: "momo"
      });

      const lipilaResponse = await fetch(
        "https://blz.lipila.io/api/v1/collections/mobile-money",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": apiKey
          },
          body: JSON.stringify(payload)
        }
      );

      const responseText = await lipilaResponse.text();

      console.log(
        "Lipila MoMo status:",
        lipilaResponse.status
      );

      let lipilaData;

      try {
        lipilaData = JSON.parse(responseText);
      } catch {
        lipilaData = {
          rawResponse: responseText
        };
      }

      if (!lipilaResponse.ok) {
        console.error(
          "Lipila MoMo rejected request:",
          lipilaData
        );

        return res.status(502).json({
          success: false,
          message: "Lipila rejected the mobile money payment request.",
          lipilaStatus: lipilaResponse.status,
          details: lipilaData
        });
      }

      return res.status(200).json({
        success: true,
        paymentMethod: "momo",
        referenceId: referenceId,
        data: lipilaData
      });
    }

    /*
     * =========================================================
     * CARD
     * =========================================================
     */

    if (paymentMethod === "card") {
      const firstName = String(
        info.firstName || ""
      ).trim();

      const lastName = String(
        info.lastName || ""
      ).trim();

      const email = String(
        info.email || ""
      ).trim();

      const city = String(
        info.city || "Lusaka"
      ).trim();

      const country = String(
        info.country || "ZM"
      ).trim();

      const address = String(
        info.address || ""
      ).trim();

      const zip = String(
        info.zip || ""
      ).trim();


      /*
       * Validate card information
       */

      if (!firstName) {
        return res.status(400).json({
          success: false,
          message: "First name is required."
        });
      }

      if (!lastName) {
        return res.status(400).json({
          success: false,
          message: "Last name is required."
        });
      }

      if (!email) {
        return res.status(400).json({
          success: false,
          message: "Email address is required."
        });
      }

      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      ) {
        return res.status(400).json({
          success: false,
          message: "Please enter a valid email address."
        });
      }


      /*
       * Build the Card Collections request exactly as
       * Lipila expects it.
       */

      const cardPayload = {
        customerInfo: {
          firstName: firstName,
          lastName: lastName,
          phoneNumber: accountNumber,
          city: city,
          country: country,
          address: address,
          email: email,
          zip: zip
        },

        collectionRequest: {
          referenceId: referenceId,
          amount: amount,
          narration: String(body.narration || "Night of Laughter tickets").trim().slice(0, 100),
          accountNumber: accountNumber,
          currency: "ZMW",

          /*
           * Where Lipila should return the customer after
           * the card authorization flow.
           */
          backUrl:
            body.backUrl ||
            "https://daffodilcare.org/#/donate",

          referenceData:
            "Daffodil Care donation"
        }
      };

      console.log("Creating Card payment:", {
        referenceId,
        amount,
        paymentMethod: "card",
        email: email
      });

      /*
       * IMPORTANT:
       * Never log cardPayload here because it contains
       * the full card number.
       */

      const lipilaResponse = await fetch(
        "https://blz.lipila.io/api/v1/collections/card",
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "x-api-key": apiKey
          },
          body: JSON.stringify(cardPayload)
        }
      );

      const responseText = await lipilaResponse.text();

      console.log(
        "Lipila Card status:",
        lipilaResponse.status
      );

      let lipilaData;

      try {
        lipilaData = JSON.parse(responseText);
      } catch {
        lipilaData = {
          rawResponse: responseText
        };
      }

      if (!lipilaResponse.ok) {
        console.error(
          "Lipila Card rejected request:",
          lipilaData
        );

        return res.status(502).json({
          success: false,
          message: "Lipila rejected the card payment request.",
          lipilaStatus: lipilaResponse.status,
          details: lipilaData
        });
      }

      /*
       * Lipila returns a cardRedirectionUrl.
       *
       * The customer must be redirected there to complete
       * the card authorization.
       */

      const cardRedirectionUrl =
        lipilaData.cardRedirectionUrl ||
        lipilaData.data?.cardRedirectionUrl ||
        lipilaData.redirectUrl ||
        lipilaData.data?.redirectUrl;

      if (!cardRedirectionUrl) {
        console.error(
          "Lipila Card response did not contain cardRedirectionUrl:",
          lipilaData
        );

        return res.status(502).json({
          success: false,
          message:
            "Card payment was created but Lipila did not return a payment redirect URL.",
          referenceId: referenceId,
          data: lipilaData
        });
      }

      return res.status(200).json({
        success: true,
        paymentMethod: "card",
        referenceId: referenceId,
        cardRedirectionUrl: cardRedirectionUrl,
        data: lipilaData
      });
    }

    /*
     * ---------------------------------------------------------
     * INVALID PAYMENT METHOD
     * ---------------------------------------------------------
     */

    return res.status(400).json({
      success: false,
      message:
        "Invalid payment method. Choose mobile money or card."
    });

  } catch (error) {
    console.error(
      "CREATE PAYMENT ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      message: "Payment function failed.",
      error: error.message
    });
  }
};
