


/* 
High Level Object.  Contains all the rate lookups for a Carrier Account (includes all services)
*/
class RateCard {
    rateCardId: string;
    carrierCode: string; //USPS, UPS, etc
    baseRateCardId?: string;//Reference to a base rate card 
    rates: unknown;
}
// Here I define rate cards over multiple carriers.  Notice that the rates object is just a key lookup
let rates: Array<RateCard> = [
    {
        /*Definition of a base rate table - contains all services */
        rateCardId: "SAS-Base",
        carrierCode: "USPS",
        rates: {
            "priority-zone1-package1-30lb": { currency: "USD", amount: 34.09 },
            "priority-zone1-package1-40lb": { currency: "USD", amount: 39.09 },
            "priority-zone2-package1-30lb": { currency: "USD", amount: 34.09 },
            "priority-zone3-package1-40lb": { currency: "USD", amount: 39.09 },
            "priority-zone1-package2-30lb": { currency: "USD", amount: 34.09 },
            "priority-zone1-package2-40lb": { currency: "USD", amount: 39.09 },
            "priority-zone2-package2-30lb": { currency: "USD", amount: 34.09 },
            "priority-zone3-package2-40lb": { currency: "USD", amount: 39.09 },
            "priority-zone1-cubic1": { currency: "USD", amount: 39.09 },
            "priority-zone1-cubic2": { currency: "USD", amount: 39.09 },
            "priority-zone2-cubic1": { currency: "USD", amount: 33.09 },
            "priority-zone2-cubic2": { currency: "USD", amount: 39.09 },
            "priority-zone3-cubic1": { currency: "USD", amount: 39.09 },
            "priority-zone4-cubic2": { currency: "USD", amount: 39.09 },
            "flatrate": { currency: "USD", amount: 34 },
            "contains-alcohol": { currency: "USD", amount: 3 },
            "fuel-charge-zone1": { currency: "USD", amount: 3 },
            "fuel-charge-zone2": { currency: "USD", amount: 4 },
            "fuel-charge-zone3": { currency: "USD", amount: 5 },
        }
    },
    {
        /*Definition of custom rate card for a customer.  You only need to define rates that are diffrent than the base and can make the cost relative to the base
        This customer has special rates for priorty, flatrate and doesn't get a alcohol surcharge
        */
        rateCardId: "Customer-Carrier-23423423",
        carrierCode: "USPS",
        baseRateCardId: "SAS-Base",
        rates: {
            "priority-zone2-package1-30lb": { discount: 0.2 },
            "priority-zone3-package1-40lb": { discount: 0.2 },
            "priority-zone1-package2-30lb": { discount: 0.23 },
            "priority-zone1-package2-40lb": { discount: 0.23 },
            "flatrate": { currency: "USD", amount: 15 },
            "contains-alcohol": { currency: "USD", amount: 0 },
        }
    },
    /*example of a rate card for LaPost that has a much simple rate set*/
    {
        rateCardId: "LaPost-ShipStationRates",
        carrierCode: "LAPOST",
        rates: {
            "laground-zone1": { currency: "EU", amount: 0.2 },
            "laground-zone2": { currency: "EU", amount: 0.2 },
            "laground-zone3": { currency: "EU", amount: 0.23 },
            "pudo-charge": { currency: "EU", amount: 0.23 },
        }
    }
]

/* 
    If a ShipEngine Connect carrier supports native rates.  The developer will need to implement a few new methods.  I'm including Zone
    in the just as an example of how we could do it.
*/
interface ICarrier {
    rateShipment(s: Shipment, rateCardId: string): RateResult;
    getZone(s: Shipment): string;
}
// Example of having a standard way to look up a rate given a rate card and key.  It contains logic on using a base rate if not provided and  alows discount pricing
class RateProvider {
    getRate(rateCardId: string, key: string): number {
        //find the rate card from some service
        let rateCard = rates.find(x => x.rateCardId = rateCardId);
        if (!rateCard)
            throw "no rate card found"
        
        //find the base rate if present
        let baseRateCard = rateCard.baseRateCardId ? rates.find(x => x.rateCardId == rateCard.baseRateCardId) : null;
        let rateAmount = rateCard.rates[key];
        if (!rateAmount) // If not in the rate card then check and return the value from the base rate
        {
            return baseRateCard[key].amount
        }
        //If the rate is a discount from the base rate then make the calculation (i know i'm not doing any error checking)
        if (rateAmount.discount) {
            let baseRate = baseRateCard[key];
            return baseRate.amount - (baseRate.amount * rateAmount.discount);
        }
        else return rateAmount; // just return the rate from the lookup table
    }
}
// Here is a sample implemetation for a carrier.  
class USPS implements ICarrier {

    getZone(s: Shipment): string {
        //make call to zone lookup
        return "1;"
    }
    //Helper function to generate the key for Cubic rating
    private getRateKeyCubic(s: Shipment, zone: string): string {
        if(s.service!="priority")
            return null // only priority has cubic rates - fake news
        let cubic = "1";// CalculateCubic(s);
        return `${s.service}-zone${zone}priority-zone1-cubic-${cubic}`

    }
    //Helper function to generate the key for weight rating
    getRateKeyWeight(s: Shipment, zone: string): string {
        //this is bad but just to demonstrate how flexible it is
        switch (s.service) {
            case ("priority"):
                if (s.weight < 30) {
                    return `priority-zone${zone}-${s.package}-30lb`
                }
                if (s.weight >= 30 && s.weight < 40) {
                    return `priority-zone${zone}-${s.package}-40lb`
                }
                return null // no rate
            case ("flatrate"):
                return "flatrate";
            default:
                return null;
        }
    }
    rateShipment(s: Shipment, rateCardId: string): RateResult {
        let rateResult = new RateResult();
        let rateProvider = new RateProvider();
        let zone = this.getZone(s);

        let weighRateKey = this.getRateKeyWeight(s, zone);
        let cubicRateKey = this.getRateKeyCubic(s, zone);
        //
        if (cubicRateKey && weighRateKey) {
            //If we have both a cubic and weightRate then return the lowest cost
            let weightRate = rateProvider.getRate(rateCardId, weighRateKey)
            let cubicRateKey = rateProvider.getRate(rateCardId, weighRateKey)
            if (weightRate > cubicRateKey) {
                rateResult.RateCharge.push({ amount: cubicRateKey, name: "Rate Cubic", currency: "US" })
            }
            else {
                rateResult.RateCharge.push({ amount: weightRate, name: "Rate Weight", currency: "US" })
            }
        }
        else if (weighRateKey) {
            let weightRate = rateProvider.getRate(rateCardId, weighRateKey)
            rateResult.RateCharge.push({ amount: weightRate, name: "Rate Cubic", currency: "US" })
        } if (cubicRateKey) {
            let weightRate = rateProvider.getRate(rateCardId, weighRateKey)
            rateResult.RateCharge.push({ amount: weightRate, name: "Rate Weight", currency: "US" })
        }
        else return null; // didn't find the rate 
        //example of adding surcharges
        if (s.options.alcohol) {
            let alcoholCharge = rateProvider.getRate(rateCardId, "contains-alcohol")
            rateResult.RateCharge.push({ amount: alcoholCharge, name: "Alcohol surcharge", currency: "US" })
        }
        let fuelCharge = rateProvider.getRate(rateCardId, "fuel-charge-zone" + zone)
        rateResult.RateCharge.push({ amount: fuelCharge, name: "Fule surcharge", currency: "US" })

        return rateResult

    }

}


/// Helper Objects
class Address {
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    contry: string;
    isPudo: string;
}
class ShipmentOption {
    alcohol: boolean
    pudo: boolean
}
class Shipment {
    toAddress: Address;
    fromAddress: Address;
    carrierCode: string;
    service: string;
    package: string;
    weight: number;
    options: ShipmentOption;
}
class RateCharge {
    name: string;
    amount: number;
    currency: string;
}
class RateResult {
    total: number;
    currency: string;
    RateCharge: Array<RateCharge> = new Array<RateCharge>();
}
