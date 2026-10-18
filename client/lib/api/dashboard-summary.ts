export const DASHBOARD_SUMMARY_OPERATION = "DashboardSummary";

export const DASHBOARD_SUMMARY_QUERY = /* GraphQL */ `
  query DashboardSummary(
    $metricId: String
    $regionId: String
    $datasetVersionId: String
    $dimensionHash: String
    $periodStart: String
    $periodEnd: String
  ) {
    dashboardSummary(
      metricId: $metricId
      regionId: $regionId
      datasetVersionId: $datasetVersionId
      dimensionHash: $dimensionHash
      periodStart: $periodStart
      periodEnd: $periodEnd
    ) {
      metrics {
        id
        key
        label
        description
        valueType
        canonicalUnit
        allowedAggregation
        calculationVersion
        status
        createdAt
        updatedAt
      }
      aggregates {
        id
        datasetVersionId
        regionId
        metric {
          id
          key
          label
          description
          valueType
          canonicalUnit
          allowedAggregation
          calculationVersion
          status
          createdAt
          updatedAt
        }
        aggregateType
        periodStart
        periodEnd
        value {
          type
          value
        }
        unit
        dimensionHash
        observationCount
        datasetVersionIds
        createdAt
      }
      savedViews {
        id
        name
        description
        ownerAccountId
        status
        createdAt
        updatedAt
        filters {
          metricId
          regionId
          datasetVersionId
          dimensionHash
          periodStart
          periodEnd
        }
        presentation {
          chart
          compareBy
        }
      }
    }
  }
`;
