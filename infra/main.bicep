// EnglishTutor on Azure: everything the app needs, on always-free tiers.
//
//   Static Web App  swa-englishtutor                Free plan, frontend + managed Functions API
//     custom domains  erkel2023b.hu, www.erkel2023b.hu   (DNS records live at the registrar, see infra/README.md)
//   Cosmos DB      cosmos-englishtutor-<suffix>    free tier, account throughput limited to 1000 RU/s
//     database      englishtutor                    1000 RU/s shared by its containers
//     container     progress                        one document per pupil, partition key /id
//     container     dictionary                      the teachers' entries and topics, partition key /classId
//
// Deploy into the resource group rg-englishtutor; see infra/README.md. Every resource goes to East US 2,
// whatever the group's own region is (that only says where the group's metadata is kept).
// Secrets are not set here: the API's environment variables are set with the Azure CLI, so that
// redeploying this template never wipes them.

targetScope = 'resourceGroup'

@description('Region of the Static Web App, whose managed API runs there. Static Web Apps Free exists only in centralus, eastus2, westus2, westeurope and eastasia, and new tenants are currently refused in westeurope (https://aka.ms/locationineligible). eastus2 is the nearest of the others to Hungary.')
param location string = 'eastus2'

@description('Region of the Cosmos DB account. Keep it equal to the Static Web App so that the API and the database are a few milliseconds apart; change it only if Cosmos DB refuses the region.')
param cosmosLocation string = location

@description('Makes the Cosmos DB account name globally unique.')
param cosmosSuffix string = take(uniqueString(resourceGroup().id), 6)

@description('Custom domains of the Static Web App; the Free plan allows 2. The DNS records must exist before the deployment, because Azure validates them while it runs: a TXT record carrying a token for a root domain (dns-txt-token), the CNAME record itself for a subdomain (cname-delegation). To deploy somewhere the records do not exist yet, pass --parameters customDomains="[]" first (see infra/README.md).')
param customDomains array = [
  {
    name: 'erkel2023b.hu'
    validationMethod: 'dns-txt-token'
  }
  {
    name: 'www.erkel2023b.hu'
    validationMethod: 'cname-delegation'
  }
]

var appName = 'englishtutor'

resource staticWebApp 'Microsoft.Web/staticSites@2024-11-01' = {
  name: 'swa-${appName}'
  location: location
  sku: {
    name: 'Free'
    tier: 'Free'
  }
  properties: {
    // Pull-request previews would get the production environment variables, and so the
    // production database. Deploy only from master.
    stagingEnvironmentPolicy: 'Disabled'
    allowConfigFileUpdates: true
  }
}

// The TLS certificates are issued and renewed by Azure at no charge, as long as the names keep resolving
// to the Static Web App.
resource customDomain 'Microsoft.Web/staticSites/customDomains@2024-11-01' = [for domain in customDomains: {
  parent: staticWebApp
  name: domain.name
  properties: {
    validationMethod: domain.validationMethod
  }
}]

resource cosmos'Microsoft.DocumentDB/databaseAccounts@2025-04-15' = {
  name: 'cosmos-${appName}-${cosmosSuffix}'
  location: cosmosLocation
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    // Only one free-tier account is allowed per subscription, and only at creation time.
    enableFreeTier: true
    // The free tier covers 1000 RU/s; the limit makes it impossible to provision (and pay for) more.
    capacity: {
      totalThroughputLimit: 1000
    }
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: cosmosLocation
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    // Point-in-time restore for the last 7 days; this tier has no backup storage charge.
    backupPolicy: {
      type: 'Continuous'
      continuousModeProperties: {
        tier: 'Continuous7Days'
      }
    }
    minimalTlsVersion: 'Tls12'
    // The API's key can read and write documents, but not create or delete databases and containers.
    disableKeyBasedMetadataWriteAccess: true
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2025-04-15' = {
  parent: cosmos
  name: appName
  properties: {
    resource: {
      id: appName
    }
    options: {
      throughput: 1000
    }
  }
}

resource progressContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'progress'
  properties: {
    resource: {
      id: 'progress'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
        version: 2
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        // The game state is only ever read whole; not indexing it makes every save cheaper.
        excludedPaths: [
          {
            path: '/data/*'
          }
          {
            path: '/"_etag"/?'
          }
        ]
      }
    }
  }
}

// The whole class dictionary (entries and topics, told apart by `type`) lives in one logical partition,
// "class", so reading it is a single-partition query and several documents can change in one batch.
// Default indexing: the documents are small and are queried by their fields.
resource dictionaryContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2025-04-15' = {
  parent: database
  name: 'dictionary'
  properties: {
    resource: {
      id: 'dictionary'
      partitionKey: {
        paths: [
          '/classId'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

output staticWebAppName string = staticWebApp.name
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output customDomainUrls array = [for domain in customDomains: 'https://${domain.name}']
output cosmosAccountName string = cosmos.name
